"""Минимальный клиент Chrome DevTools Protocol на стандартной библиотеке.

Используется только для автоматической проверки панели управления.
"""

from __future__ import annotations

import base64
import json
import os
import socket
import struct
import subprocess
import time
import urllib.request


class WS:
    def __init__(self, url: str):
        assert url.startswith("ws://")
        rest = url[len("ws://") :]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(handshake.encode())
        buffer = b""
        while b"\r\n\r\n" not in buffer:
            buffer += self.sock.recv(4096)
        self.buffer = buffer.split(b"\r\n\r\n", 1)[1]

    def _recv_exact(self, count: int) -> bytes:
        while len(self.buffer) < count:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("Соединение закрыто")
            self.buffer += chunk
        out, self.buffer = self.buffer[:count], self.buffer[count:]
        return out

    def send(self, payload: str) -> None:
        data = payload.encode()
        header = bytearray([0x81])
        length = len(data)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def recv(self) -> str:
        while True:
            first, second = self._recv_exact(2)
            opcode = first & 0x0F
            length = second & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(8))[0]
            payload = self._recv_exact(length)
            if opcode == 0x8:
                raise ConnectionError("WebSocket закрыт")
            if opcode in (0x1, 0x2):
                return payload.decode("utf-8", errors="replace")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


class Browser:
    def __init__(self, chrome: str, port: int = 9222, headless: bool = True):
        profile = os.path.join(os.environ["TEMP"], "somnoi-test", "profile")
        args = [
            chrome,
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-gpu",
            "--disable-extensions",
            "--hide-scrollbars",
            "about:blank",
        ]
        if headless:
            args.insert(1, "--headless=new")

        self.process = subprocess.Popen(
            args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        self.port = port
        self.ws = None
        self.msg_id = 0
        self.console: list[dict] = []
        self._connect()

    def _connect(self) -> None:
        deadline = time.time() + 30
        target = None
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{self.port}/json/list", timeout=2
                ) as response:
                    targets = json.loads(response.read())
                pages = [t for t in targets if t.get("type") == "page"]
                if pages:
                    target = pages[0]
                    break
            except Exception:  # noqa: BLE001
                time.sleep(0.4)
        if not target:
            raise RuntimeError("Не удалось подключиться к Chrome")

        self.ws = WS(target["webSocketDebuggerUrl"])
        self.call("Runtime.enable")
        self.call("Page.enable")
        self.call("Log.enable")

    def call(self, method: str, params: dict | None = None, timeout: float = 30):
        self.msg_id += 1
        message_id = self.msg_id
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))

        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self.ws.recv()
            data = json.loads(raw)
            if data.get("method") == "Page.javascriptDialogOpening":
                # Панель предупреждает о неопубликованных правках через
                # beforeunload — подтверждаем, иначе переход зависнет.
                self.msg_id += 1
                self.ws.send(
                    json.dumps(
                        {
                            "id": self.msg_id,
                            "method": "Page.handleJavaScriptDialog",
                            "params": {"accept": True},
                        }
                    )
                )
            elif data.get("method") == "Runtime.consoleAPICalled":
                self.console.append(
                    {
                        "type": data["params"]["type"],
                        "text": " ".join(
                            str(arg.get("value", arg.get("description", "")))
                            for arg in data["params"].get("args", [])
                        ),
                    }
                )
            elif data.get("method") == "Log.entryAdded":
                entry = data["params"]["entry"]
                self.console.append(
                    {
                        "type": entry["level"],
                        "text": f"{entry['text']} [{entry.get('url', '')}]",
                    }
                )
            elif data.get("method") == "Runtime.exceptionThrown":
                details = data["params"]["exceptionDetails"]
                self.console.append(
                    {
                        "type": "exception",
                        "text": details.get("text", "")
                        + " "
                        + str(
                            details.get("exception", {}).get("description", "")
                        ),
                    }
                )
            elif data.get("id") == message_id:
                if "error" in data:
                    raise RuntimeError(f"{method}: {data['error']}")
                return data.get("result", {})
        raise TimeoutError(f"Нет ответа на {method}")

    def navigate(self, url: str, settle: float = 1.6) -> None:
        self.call("Page.navigate", {"url": url})
        time.sleep(settle)

    def js(self, expression: str, timeout: float = 30):
        result = self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": True,
                "returnByValue": True,
                "userGesture": True,
            },
            timeout=timeout,
        )
        if result.get("exceptionDetails"):
            details = result["exceptionDetails"]
            raise RuntimeError(
                details.get("exception", {}).get("description") or details.get("text")
            )
        return result.get("result", {}).get("value")

    def viewport(self, width: int, height: int, mobile: bool = False) -> None:
        self.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": mobile,
            },
        )

    def screenshot(self, path: str) -> None:
        result = self.call("Page.captureScreenshot", {"format": "png"})
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(result["data"]))

    def errors(self) -> list[dict]:
        return [
            entry
            for entry in self.console
            if entry["type"] in ("error", "exception")
            and "favicon" not in entry["text"].lower()
        ]

    def clear_console(self) -> None:
        self.console.clear()

    def close(self) -> None:
        try:
            self.call("Browser.close", timeout=3)
        except Exception:  # noqa: BLE001
            pass
        if self.ws:
            self.ws.close()
        try:
            self.process.terminate()
        except Exception:  # noqa: BLE001
            pass

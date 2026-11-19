"""实跑台的本地服务器：把插件的真实路由映射成静态路径。

  /srs/deck.json      → ../data/deck.json
  /srs/tarot.json     → ../data/tarot.json
  /srs/cards/<rel>    → ../assets/cards/<rel>
  其它                 → 本目录（index.html、node_modules）

这样前端里的 fetch('/srs/…') 与 <img src="/srs/cards/…"> 不用改一行就能跑。
"""
import http.server
import os
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data")
CARDS = os.path.join(ROOT, "assets", "cards")
SFX = os.path.join(ROOT, "assets", "sfx")
PORT = 8899


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean == "/srs/deck.json":
            return os.path.join(DATA, "deck.json")
        if clean == "/srs/billing.json":
            return os.path.join(HERE, "billing_stub.json")
        if clean == "/srs/live.json":
            return os.path.join(HERE, "live_stub.json")
        if clean == "/srs/turn.json":
            return os.path.join(HERE, "live_stub.json")
        if clean == "/srs/usage.json":
            return os.path.join(HERE, "usage_stub.json")
        if clean == "/srs/tarot.json":
            return os.path.join(DATA, "tarot.json")
        if clean.startswith("/srs/cards/"):
            rel = clean[len("/srs/cards/"):]
            return os.path.join(CARDS, rel)
        if clean.startswith("/srs/sfx/"):
            # W19 环境音景：只放行四套循环
            name = clean[len("/srs/sfx/"):]
            if name in ("amb-rain.mp3", "amb-fire.mp3", "amb-wind.mp3", "amb-pages.mp3",
                        "amb-night.mp3", "amb-sea.mp3", "amb-storm.mp3", "amb-birds.mp3"):
                return os.path.join(SFX, name)
            return os.path.join(HERE, "__missing__")
        if clean == "/client.js":
            return os.path.join(ROOT, "plugin", "client.js")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class HarnessServer(socketserver.ThreadingTCPServer):
    """多线程 + 大 backlog。

    单线程 TCPServer 会让牌库那一页的十几次并发请求直接被拒（ERR_CONNECTION_REFUSED）；
    backlog 默认只有 5，22 张缩略图同时进来也会灌满。
    DSH 宿主的 Node 路由本来就是异步的，这里贴近真机行为。
    """
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    with HarnessServer(("127.0.0.1", port), Handler) as httpd:
        print("harness on http://127.0.0.1:%d/index.html" % port, flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()

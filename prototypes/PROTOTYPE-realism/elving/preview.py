from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path not in ('/','/PROTOTYPE-elving.html'):self.send_response(404);self.end_headers();return
  data=Path(__file__).with_name('PROTOTYPE-elving.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
HTTPServer(('127.0.0.1',3039),Handler).serve_forever()

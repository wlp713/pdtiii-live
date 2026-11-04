#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 Cloudflare 部署所需的两条 GitHub Actions Secret 写进两个仓库。

用法:
    python3 scripts/set_cf_github_secrets.py --token <CF_API_TOKEN> [--account <ACCOUNT_ID>]

说明:
  - GH PAT 默认从环境变量 GH_TOKEN 读；没有则从 pdtiii-live/mobile 的 git remote URL 里解析。
  - 写入 pdtiii-live 与 pdtiii-mobile 两个仓库：
        CLOUDFLARE_API_TOKEN  = 传入的 token
        CLOUDFLARE_ACCOUNT_ID = 账号 ID（默认 6111f4c9f8efa20d9b40f36da1040bda）
  - 之后 push 到 main 就会触发 .github/workflows/deploy-cloudflare.yml 自动部署，
    完全不依赖本机是否开机。
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.request

REPOS = ["wlp713/pdtiii-live", "wlp713/pdtiii-mobile"]
DEFAULT_ACCOUNT = "6111f4c9f8efa20d9b40f36da1040bda"
API = "https://api.github.com"


def find_pat():
    pat = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if pat:
        return pat
    for d in ("/mnt/c/Users/19777/Desktop/pdtiii-live",
              "/mnt/c/Users/19777/Desktop/pdtiii-mobile"):
        try:
            url = subprocess.check_output(["git", "-C", d, "remote", "get-url", "origin"], text=True)
        except Exception:
            continue
        m = re.search(r"https://[^:]+:([^@]+)@github\.com", url)
        if m:
            return m.group(1)
    sys.exit("找不到 GitHub token（设置 GH_TOKEN 环境变量）")


def gh(method, path, token, body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "token " + token,
            "Accept": "application/vnd.github+json",
            "User-Agent": "openclaw-secret-setter",
            "Content-Type": "application/json",
        })
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def put_secret(repo, name, value, gh_token):
    from nacl import encoding, public
    key = gh("GET", f"/repos/{repo}/actions/secrets/public-key", gh_token)
    pk = public.PublicKey(key["key"].encode(), encoding.Base64Encoder())
    sealed = base64.b64encode(public.SealedBox(pk).encrypt(value.encode())).decode()
    gh("PUT", f"/repos/{repo}/actions/secrets/{name}", gh_token,
       {"encrypted_value": sealed, "key_id": key["key_id"]})
    print(f"  {repo}: {name} ✓")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True, help="Cloudflare API Token")
    ap.add_argument("--account", default=DEFAULT_ACCOUNT)
    a = ap.parse_args()
    gh_token = find_pat()
    for repo in REPOS:
        put_secret(repo, "CLOUDFLARE_API_TOKEN", a.token, gh_token)
        put_secret(repo, "CLOUDFLARE_ACCOUNT_ID", a.account, gh_token)
    print("完成。push 到 main 即可触发 Cloudflare Pages 自动部署。")


if __name__ == "__main__":
    main()

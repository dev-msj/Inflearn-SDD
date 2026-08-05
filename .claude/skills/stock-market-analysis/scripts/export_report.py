#!/usr/bin/env python3
"""
export_report.py - 마크다운 분석 보고서를 PDF로 변환

Python 표준 라이브러리와 시스템에 설치된 Chrome/Edge만 사용합니다.
별도 패키지(pandoc, wkhtmltopdf, reportlab 등) 설치가 필요 없습니다.

동작: 마크다운 -> 인쇄용 CSS를 입힌 HTML -> 헤드리스 브라우저 --print-to-pdf

사용 예:
    python export_report.py output/삼성전자_20260805.md
        -> output/삼성전자_20260805.pdf 생성

    python export_report.py report.md -o /경로/보고서.pdf --keep-html
    python export_report.py report.md --html-only     # 브라우저 없이 HTML만
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --------------------------------------------------------------------------
# 마크다운 -> HTML
#
# 범용 마크다운 파서가 아니라 보고서 템플릿(assets/report-template.md)이 쓰는 문법만
# 다룹니다: 제목, GFM 표, 목록, 인용, 강조, 인라인 코드, 수평선, 링크.
# 표 렌더링이 핵심이라 그쪽에 정확도를 집중했습니다.
# --------------------------------------------------------------------------
INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
TABLE_SEP = re.compile(r"^\s*\|?[\s:\-|]+\|[\s:\-|]*$")
# 새 블록의 시작 — 문단이나 목록 항목이 여기서 끊깁니다.
BLOCK_START = re.compile(r"^\s*(#{1,6}\s|>|[-*+]\s|\d+\.\s|(-{3,}|\*{3,}|_{3,})\s*$)")


def inline(text: str) -> str:
    """인라인 문법 처리. 코드 조각은 먼저 빼내 이스케이프 충돌을 피합니다."""
    stash: list[str] = []

    def keep(m):
        stash.append(html.escape(m.group(1)))
        return f"\x00{len(stash) - 1}\x00"

    text = INLINE_CODE.sub(keep, text)
    text = html.escape(text)
    text = LINK.sub(r'<a href="\2">\1</a>', text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    for i, code in enumerate(stash):
        text = text.replace(f"\x00{i}\x00", f"<code>{code}</code>")
    return text


def split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def alignments(sep: str) -> list[str]:
    out = []
    for c in split_row(sep):
        left, right = c.startswith(":"), c.endswith(":")
        out.append("center" if left and right else "right" if right else "left")
    return out


def md_to_html(md: str) -> tuple[str, str]:
    """마크다운을 HTML 본문으로 변환하고 (본문, 제목) 을 반환합니다."""
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    title = ""
    i, n = 0, len(lines)
    list_stack: list[str] = []

    def close_lists():
        while list_stack:
            out.append(f"</{list_stack.pop()}>")

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            close_lists()
            i += 1
            continue

        # 표: 헤더 행 다음 줄이 구분선이면 표로 처리
        if "|" in stripped and i + 1 < n and TABLE_SEP.match(lines[i + 1]) and "|" in lines[i + 1]:
            close_lists()
            headers = split_row(stripped)
            aligns = alignments(lines[i + 1])
            i += 2
            body = []
            while i < n and "|" in lines[i] and lines[i].strip():
                body.append(split_row(lines[i]))
                i += 1
            out.append('<table><thead><tr>')
            for idx, h in enumerate(headers):
                a = aligns[idx] if idx < len(aligns) else "left"
                out.append(f'<th style="text-align:{a}">{inline(h)}</th>')
            out.append("</tr></thead><tbody>")
            for row in body:
                out.append("<tr>")
                for idx in range(len(headers)):
                    cell = row[idx] if idx < len(row) else ""
                    a = aligns[idx] if idx < len(aligns) else "left"
                    out.append(f'<td style="text-align:{a}">{inline(cell)}</td>')
                out.append("</tr>")
            out.append("</tbody></table>")
            continue

        # 수평선
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            close_lists()
            out.append("<hr>")
            i += 1
            continue

        # 제목
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            close_lists()
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1 and not title:
                title = re.sub(r"[*`\[\]]", "", text)
            out.append(f"<h{level}>{inline(text)}</h{level}>")
            i += 1
            continue

        # 인용 (연속 줄 병합)
        if stripped.startswith(">"):
            close_lists()
            quote = []
            while i < n and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append("<blockquote>" + "<br>".join(inline(q) for q in quote if q) + "</blockquote>")
            continue

        # 목록 (체크박스 포함)
        m = re.match(r"^\s*([-*+]|\d+\.)\s+(.*)$", line)
        if m:
            tag = "ul" if m.group(1) in "-*+" else "ol"
            if not list_stack or list_stack[-1] != tag:
                close_lists()
                out.append(f"<{tag}>")
                list_stack.append(tag)
            item = m.group(2)
            i += 1

            # 여러 줄에 걸친 항목의 이어지는 줄을 흡수합니다. 이 처리가 없으면 이어지는
            # 줄이 별도 문단이 되면서 목록이 닫히고, 번호 매기기가 1부터 다시 시작합니다.
            while i < n and lines[i].strip() and not BLOCK_START.match(lines[i]) \
                    and "|" not in lines[i]:
                item += " " + lines[i].strip()
                i += 1

            checkbox = re.match(r"^\[([ xX])\]\s*(.*)$", item)
            if checkbox:
                mark = "☑" if checkbox.group(1).lower() == "x" else "☐"
                item = f"{mark} {checkbox.group(2)}"
            out.append(f"<li>{inline(item)}</li>")
            continue

        # 일반 문단 (빈 줄/블록 시작 전까지 병합)
        close_lists()
        para = [stripped]
        i += 1
        while i < n and lines[i].strip() and not BLOCK_START.match(lines[i]) and "|" not in lines[i]:
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")

    close_lists()
    return "\n".join(out), title


# --------------------------------------------------------------------------
# 인쇄용 스타일
#
# A4 기준. 표가 페이지 경계에서 잘리지 않게 하고, 제목이 페이지 맨 아래에
# 홀로 남지 않도록 page-break 규칙을 넣었습니다.
# --------------------------------------------------------------------------
CSS = """
@page { size: A4; margin: 18mm 15mm; }
* { box-sizing: border-box; }
body {
  font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR",
               -apple-system, "Segoe UI", sans-serif;
  font-size: 10.5pt; line-height: 1.65; color: #1a1a1a; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 {
  font-size: 20pt; font-weight: 700; margin: 0 0 4mm; padding-bottom: 3mm;
  border-bottom: 2.5px solid #1f4e79; color: #1f4e79; letter-spacing: -0.4px;
}
h2 {
  font-size: 14pt; font-weight: 700; margin: 9mm 0 3mm; padding: 2mm 0 1.5mm;
  border-bottom: 1.5px solid #d0d7de; color: #1f4e79;
  page-break-after: avoid; break-after: avoid;
}
h3 {
  font-size: 11.5pt; font-weight: 700; margin: 6mm 0 2mm; color: #24405c;
  page-break-after: avoid; break-after: avoid;
}
h4 { font-size: 10.5pt; font-weight: 700; margin: 4mm 0 1.5mm; color: #333; }
p { margin: 0 0 2.5mm; text-align: justify; word-break: keep-all; }
strong { font-weight: 700; color: #111; }
code {
  font-family: Consolas, "D2Coding", monospace; font-size: 9.3pt;
  background: #f1f3f5; padding: 0.5mm 1.2mm; border-radius: 2px; color: #b02a37;
}
a { color: #1f4e79; text-decoration: none; }
hr { border: 0; border-top: 1px solid #e1e4e8; margin: 6mm 0; }
blockquote {
  margin: 3mm 0; padding: 2.5mm 4mm; background: #f6f8fa;
  border-left: 3.5px solid #1f4e79; color: #333; font-size: 10pt;
}
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
table {
  width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.5pt;
  page-break-inside: avoid; break-inside: avoid;
}
thead { display: table-header-group; }
th {
  background: #1f4e79; color: #fff; font-weight: 700;
  padding: 2mm 2.5mm; border: 1px solid #1f4e79; white-space: nowrap;
}
td { padding: 1.8mm 2.5mm; border: 1px solid #d0d7de; vertical-align: top; }
tbody tr:nth-child(even) { background: #f6f8fa; }

/* 마지막 섹션의 면책 고지를 시각적으로 분리 */
blockquote:last-of-type { background: #fff8e6; border-left-color: #d4a017; font-size: 9pt; }
"""

HTML_DOC = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>{title}</title>
<style>{css}</style></head>
<body>{body}</body></html>
"""


# --------------------------------------------------------------------------
# 브라우저 탐색 및 PDF 변환
# --------------------------------------------------------------------------
def find_browser() -> str | None:
    """Chrome 또는 Edge 실행 파일 경로를 찾습니다 (Windows/macOS/Linux)."""
    env = os.environ.get("CHROME_PATH")
    if env and Path(env).exists():
        return env

    for name in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
        found = shutil.which(name)
        if found:
            return found

    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        rf"{pf}\Google\Chrome\Application\chrome.exe",
        rf"{pf86}\Google\Chrome\Application\chrome.exe",
        rf"{local}\Google\Chrome\Application\chrome.exe",
        rf"{pf}\Microsoft\Edge\Application\msedge.exe",
        rf"{pf86}\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def html_to_pdf(html_path: Path, pdf_path: Path) -> None:
    """헤드리스 브라우저로 PDF를 생성합니다.

    브라우저는 상대 경로 출력을 거부하는 경우가 있어 절대 경로와 file:// URL을 씁니다.
    임시 프로필을 지정해 사용자의 실제 브라우저 세션과 충돌하지 않게 합니다.
    """
    browser = find_browser()
    if not browser:
        raise RuntimeError(
            "Chrome 또는 Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하거나 "
            "--html-only 옵션으로 HTML만 생성하세요."
        )

    pdf_path = pdf_path.resolve()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as profile:
        cmd = [
            browser,
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-pdf-header-footer",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={pdf_path}",
            html_path.resolve().as_uri(),
        ]
        # 브라우저가 한글 경로를 UTF-8로 출력하는데 Windows 기본 코덱(cp949)으로는
        # 디코딩에 실패하므로 인코딩을 명시합니다.
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120,
            encoding="utf-8", errors="replace",
        )

    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        detail = (proc.stderr or proc.stdout or "").strip()[-500:]
        raise RuntimeError(f"PDF 생성 실패 ({Path(browser).name}): {detail}")


def _use_utf8():
    """Windows 콘솔 기본 코덱(cp949)으로는 한글 출력이 깨집니다. argparse가 stderr로
    오류를 쓰기 전에 호출해야 인자 오류 메시지까지 정상 출력됩니다."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main():
    _use_utf8()
    p = argparse.ArgumentParser(
        description="마크다운 분석 보고서를 PDF로 변환합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("input", help="입력 마크다운 파일 경로")
    p.add_argument("-o", "--output", help="출력 PDF 경로 (기본: 입력과 같은 위치, 확장자만 .pdf)")
    p.add_argument("--keep-html", action="store_true", help="중간 HTML 파일을 남깁니다")
    p.add_argument("--html-only", action="store_true", help="PDF 없이 HTML만 생성합니다")
    a = p.parse_args()

    src = Path(a.input)
    if not src.exists():
        print(f"[오류] 입력 파일이 없습니다: {src}", file=sys.stderr)
        sys.exit(1)

    md = src.read_text(encoding="utf-8")
    body, title = md_to_html(md)
    doc = HTML_DOC.format(title=html.escape(title or src.stem), css=CSS, body=body)

    html_path = src.with_suffix(".html")
    keep_html = a.keep_html or a.html_only
    if not keep_html:
        tmp = tempfile.NamedTemporaryFile(
            "w", suffix=".html", delete=False, encoding="utf-8", dir=str(src.parent)
        )
        tmp.write(doc)
        tmp.close()
        html_path = Path(tmp.name)
    else:
        html_path.write_text(doc, encoding="utf-8")

    try:
        if a.html_only:
            print(f"[완료] HTML: {html_path.resolve()}")
            return

        pdf_path = Path(a.output) if a.output else src.with_suffix(".pdf")
        html_to_pdf(html_path, pdf_path)
        size_kb = pdf_path.stat().st_size / 1024
        print(f"[완료] MD : {src.resolve()}")
        print(f"[완료] PDF: {pdf_path.resolve()} ({size_kb:,.1f} KB)")
        if keep_html:
            print(f"[완료] HTML: {html_path.resolve()}")
    except Exception as e:
        print(f"[오류] {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if not keep_html and html_path.exists():
            html_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()

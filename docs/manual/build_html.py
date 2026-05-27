#!/usr/bin/env python3
"""Build HTML manual from Markdown for PresuControl V5."""

import base64
import re
from pathlib import Path

import markdown

# Paths
SCRIPT_DIR = Path(__file__).parent
MANUAL_MD = SCRIPT_DIR / "MANUAL.md"
SCREENSHOTS_DIR = SCRIPT_DIR / "screenshots"
OUTPUT_HTML = SCRIPT_DIR / "MANUAL.html"


def image_to_base64(image_path: Path) -> str:
    """Convert image to base64 data URI."""
    if not image_path.exists():
        return ""
    ext = image_path.suffix.lower().lstrip(".")
    mime_types = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
    }
    mime = mime_types.get(ext, "image/png")
    data = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def convert_markdown_images(content: str) -> str:
    """Convert markdown image references to base64 data URIs."""

    def replace_image(match):
        alt_text = match.group(1)
        image_path = match.group(2)
        # Resolve relative path from screenshots dir
        img_file = SCREENSHOTS_DIR / Path(image_path).name
        b64 = image_to_base64(img_file)
        if b64:
            return f'![{alt_text}]({b64})'
        # Fallback: keep original if not found
        return match.group(0)

    # Match ![alt](screenshots/filename.png)
    pattern = r'!\[([^\]]*)\]\((screenshots/[^)]+)\)'
    return re.sub(pattern, replace_image, content)


def build_html(markdown_content: str) -> str:
    """Build complete HTML document from markdown content."""

    # Convert image references to base64 before processing
    markdown_content = convert_markdown_images(markdown_content)

    # Convert markdown to HTML with extensions
    html_body = markdown.markdown(
        markdown_content,
        extensions=["extra", "toc", "codehilite"],
        extension_configs={
            "codehilite": {"css_class": "highlight", "guess_lang": False},
        },
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manual de Usuario - PresuControl V5</title>
    <style>
        :root {{
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --bg: #ffffff;
            --bg-alt: #f8fafc;
            --text: #1e293b;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --warning-bg: #fef3c7;
            --warning-border: #f59e0b;
            --info-bg: #dbeafe;
            --code-bg: #f1f5f9;
            --success-bg: #dcfce7;
            --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: var(--font);
            font-size: 15px;
            line-height: 1.7;
            color: var(--text);
            background: var(--bg);
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem 1.5rem;
        }}

        /* Headers */
        h1, h2, h3, h4, h5, h6 {{
            font-weight: 600;
            line-height: 1.3;
            margin-top: 2em;
            margin-bottom: 0.75em;
            color: #0f172a;
        }}

        h1 {{
            font-size: 2rem;
            text-align: center;
            margin-top: 0;
            padding-bottom: 1rem;
            border-bottom: 3px solid var(--primary);
            color: var(--primary);
        }}

        h2 {{
            font-size: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border);
            margin-top: 2.5em;
        }}

        h3 {{ font-size: 1.2rem; }}
        h4 {{ font-size: 1rem; }}

        /* Horizontal rule */
        hr {{
            border: none;
            border-top: 1px solid var(--border);
            margin: 2rem 0;
        }}

        /* Paragraphs */
        p {{
            margin-bottom: 1em;
        }}

        /* Lists */
        ul, ol {{
            margin: 1em 0;
            padding-left: 2em;
        }}

        li {{
            margin-bottom: 0.4em;
        }}

        /* Links */
        a {{
            color: var(--primary);
            text-decoration: none;
        }}

        a:hover {{
            text-decoration: underline;
        }}

        /* Images */
        img {{
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1.5em auto;
            border: 1px solid var(--border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }}

        /* Image captions via alt text styling - wrap img in figure */
        img + p:empty,
        p:has(img:last-child) {{ 
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-top: -0.5em;
            margin-bottom: 1.5em;
        }}

        /* Strong and emphasis */
        strong {{ font-weight: 600; }}
        em {{ font-style: italic; }}

        /* Code */
        code {{
            font-family: "Consolas", "Monaco", "Courier New", monospace;
            font-size: 0.9em;
            background: var(--code-bg);
            padding: 0.15em 0.4em;
            border-radius: 4px;
            color: #1e293b;
        }}

        pre {{
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 1em;
            overflow-x: auto;
            margin: 1em 0;
        }}

        pre code {{
            background: none;
            padding: 0;
            font-size: 0.875em;
        }}

        /* Blockquote */
        blockquote {{
            border-left: 4px solid var(--primary);
            background: var(--info-bg);
            padding: 0.75em 1em;
            margin: 1em 0;
            border-radius: 0 6px 6px 0;
        }}

        /* Tables */
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1.5em 0;
            font-size: 0.9rem;
        }}

        th {{
            background: var(--bg-alt);
            font-weight: 600;
            text-align: left;
            padding: 0.6em 1em;
            border: 1px solid var(--border);
        }}

        td {{
            padding: 0.5em 1em;
            border: 1px solid var(--border);
        }}

        tr:nth-child(even) {{
            background: var(--bg-alt);
        }}

        /* Table of Contents (from markdown TOC extension) */
        .toc {{ 
            background: var(--bg-alt);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1.25em 1.5em;
            margin: 2em 0;
        }}

        .toc h2 {{
            font-size: 1rem;
            margin-top: 0;
            margin-bottom: 0.75em;
            border: none;
            padding: 0;
        }}

        .toc ul {{
            margin: 0;
            padding-left: 1.5em;
        }}

        .toc > ul {{
            list-style: none;
            padding-left: 0;
        }}

        .toc > ul > li {{ margin-bottom: 0.3em; }}

        .toc a {{
            color: var(--primary);
            font-size: 0.9rem;
        }}

        /* Highlight for code */
        .highlight {{
            background: var(--code-bg);
        }}

        /* Print styles */
        @media print {{
            @page {{
                size: A4;
                margin: 2cm;
            }}

            body {{
                font-size: 11pt;
                max-width: none;
                padding: 0;
            }}

            h2 {{
                page-break-before: always;
            }}

            h1 {{ page-break-after: avoid; }}
            h2 {{ page-break-after: avoid; }}
            h3 {{ page-break-after: avoid; }}

            img {{
                max-width: 100%;
                page-break-inside: avoid;
            }}

            pre, blockquote {{
                page-break-inside: avoid;
            }}

            .toc {{
                page-break-after: always;
            }}
        }}

        /* Scrollbar styling */
        ::-webkit-scrollbar {{
            width: 8px;
            height: 8px;
        }}

        ::-webkit-scrollbar-track {{
            background: var(--bg-alt);
        }}

        ::-webkit-scrollbar-thumb {{
            background: var(--border);
            border-radius: 4px;
        }}

        ::-webkit-scrollbar-thumb:hover {{
            background: var(--text-muted);
        }}
    </style>
</head>
<body>
{html_body}
</body>
</html>"""

    return html


def main():
    if not MANUAL_MD.exists():
        print(f"ERROR: {MANUAL_MD} not found")
        return

    print(f"Reading {MANUAL_MD}")
    content = MANUAL_MD.read_text(encoding="utf-8")

    print("Converting markdown to HTML...")
    html = build_html(content)

    print(f"Writing {OUTPUT_HTML}")
    OUTPUT_HTML.write_text(html, encoding="utf-8")

    size_kb = OUTPUT_HTML.stat().st_size / 1024
    print(f"Done! Output: {OUTPUT_HTML} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
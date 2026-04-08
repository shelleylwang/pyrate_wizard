"""
Extract PyRate notes from .docx to clean HTML files for use in chat context.
Preserves headings, lists, bold, italic, and approximate color hints.
Images are replaced with [IMAGE] placeholders.
"""
import mammoth
import os
import re

NOTES_DIR = os.path.join(os.path.dirname(__file__), "shelley_notes")
OUT_DIR = os.path.join(os.path.dirname(__file__), "public")

os.makedirs(OUT_DIR, exist_ok=True)

# Custom style map: map docx paragraph/character styles to HTML
STYLE_MAP = """
p[style-name='Heading 1'] => h1:fresh
p[style-name='Heading 2'] => h2:fresh
p[style-name='Heading 3'] => h3:fresh
p[style-name='Heading 4'] => h4:fresh
p[style-name='Title'] => h1.title:fresh
r[style-name='Strong'] => strong
r[style-name='Emphasis'] => em
"""

def image_handler(image):
    # Replace all images with a text placeholder
    return {"src": "IMAGE_PLACEHOLDER"}

def convert_doc(filename, out_filename):
    path = os.path.join(NOTES_DIR, filename)
    print(f"\nConverting {filename}...")

    with open(path, "rb") as f:
        result = mammoth.convert_to_html(
            f,
            style_map=STYLE_MAP,
            convert_image=mammoth.images.img_element(image_handler)
        )

    html = result.value
    messages = result.messages

    # Replace image tags with readable placeholders
    html = re.sub(r'<img[^>]*src="IMAGE_PLACEHOLDER"[^>]*/>', '[IMAGE]', html)

    # Wrap in minimal structure with a note for Claude
    wrapped = f"""<!-- PyRate Notes: {filename} -->
<!-- Formatting note: bold/headings indicate structure and emphasis. Color hints are mostly accurate but may be inconsistent in places — use them as strong hints but ground understanding in the text content itself. -->
{html}"""

    out_path = os.path.join(OUT_DIR, out_filename)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(wrapped)

    # Stats
    text_only = re.sub(r'<[^>]+>', '', html)
    word_count = len(text_only.split())
    char_count = len(text_only)
    print(f"  Output: {out_path}")
    print(f"  Words: {word_count:,}  |  Characters: {char_count:,}  |  HTML size: {len(html):,} bytes")
    if messages:
        print(f"  Warnings ({len(messages)}):")
        for m in messages[:10]:
            print(f"    - {m}")

    return word_count, char_count

w1, c1 = convert_doc("PyRate_Notes_Tutorials.docx", "notes_tutorials.html")
w2, c2 = convert_doc("PyRate_Notes_Concepts.docx",  "notes_concepts.html")

print(f"\nTotal: {w1+w2:,} words, {c1+c2:,} characters across both files")
print("Done. Files saved to public/")

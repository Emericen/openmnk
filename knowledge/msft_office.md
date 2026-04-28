## Working with Word documents

Use `python-docx` to read and write `.docx` files. When editing an existing document, do not rewrite the entire file. Load the document, make targeted insertions or modifications, and save it back. To insert a new paragraph after a specific position:

```python
from docx import Document
doc = Document("file.docx")
# Insert a paragraph after paragraph index 3
from docx.oxml.ns import qn
new_p = doc.paragraphs[3]._element.addnext(
    doc.add_paragraph("New text")._element
)
doc.save("file.docx")
```

To read content:

```python
for p in doc.paragraphs:
    print(p.style.name, p.text)
```

When creating a new document that needs to match an existing format, load the formatted document as a template, clear its content, and rebuild — this preserves the style definitions.

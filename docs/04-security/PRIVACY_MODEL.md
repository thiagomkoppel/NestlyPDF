# Privacy Model

## Privacy promise

The document is processed locally in the browser and is not uploaded to the application operator.

## Data classification

PDF bytes, imported `.docx` bytes, converted document content, rendered pages, extracted text, signatures, initials, images, and form values are private document data.

## Rules

- Private document data remains local.
- No private document data enters analytics.
- No private document data enters error reporting.
- No private document data is written to URLs.
- No private document data is stored in LocalStorage.
- No document history is maintained.
- Third-party scripts are prohibited on the editor route unless proven incapable of observing document data and explicitly approved.
- `.docx` to PDF conversion runs locally; imported bytes and the scratch render container are released when conversion finishes or fails.

## Accurate wording

Use:

> Your PDF is processed in your browser and is not uploaded to us.

> Word documents are converted to PDF in your browser and are not uploaded to us.

Do not use absolute claims such as “impossible to access,” “military-grade privacy,” or “permanently erased from memory.”

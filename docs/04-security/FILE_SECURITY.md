# File Security

## PDFs are untrusted input

The application must assume that every PDF may be malformed or malicious.

## Word documents are untrusted input

`.docx` files are treated as untrusted. Conversion to PDF happens entirely in the
browser (ADR-006).

- Render converted document content into an inert, hidden, off-viewport container
  that is never attached to a live interactive region.
- Do not execute scripts, follow links, or load external resources referenced by
  the document during conversion.
- Apply a file size limit before conversion and fail gracefully when exceeded.
- Remove the scratch container and release the original `.docx` bytes as soon as
  conversion finishes or fails.
- Legacy binary `.doc` files are rejected, not parsed.

## Controls

- Use maintained PDF libraries.
- Disable embedded JavaScript execution.
- Ignore launch actions and external application actions.
- Do not automatically open embedded links or attachments.
- Apply file size and page count safety limits based on device capability.
- Use workers for parsing where supported.
- Enforce a restrictive Content Security Policy.
- Prevent rendered document content from becoming executable HTML.
- Sanitize filenames before suggesting an export filename.

## Password-protected files

The MVP may support opening a password-protected PDF when the user provides the password and the selected library safely supports it. It must not bypass or crack passwords.

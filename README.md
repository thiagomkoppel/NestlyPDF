# NestlyPDF

**A free, open-source, privacy-first PDF editor that runs locally in your browser.**

🌐 **Try it:** nestlypdf.com

NestlyPDF was built around a simple idea: basic PDF editing shouldn't require uploading your documents to someone else's server or creating an account.

Your PDF stays on your device. Editing and processing happen locally in the browser.

NestlyPDF is also a **Progressive Web App (PWA)**, so it can be installed on supported computers, phones, and tablets and used **offline**.

---

## 🔒 Privacy by Design

NestlyPDF is designed to keep document processing local.

- **No document uploads**
- **No cloud document storage**
- **No account required**
- **PDF processing happens locally in your browser**
- **Your document stays on your device**

Closing the editor or leaving the session discards the working document from the application. NestlyPDF does not provide cloud document history or synchronization.

> **Note:** Whiteout visually covers content. It should not be considered secure redaction of sensitive information.

---

## ✨ Features

### PDF Editing

- Add and edit text
- Add dates
- Add checkmarks and crosses
- Add images
- Whiteout content
- Add signatures, including uploaded photos of a handwritten signature with the paper background removed in your browser
- Add initials
- Move and resize elements
- Copy and paste supported elements
- Undo and redo changes

### Layers

- View added elements as layers
- Reorder layers
- Hide and show individual layers
- Lock and unlock individual layers
- Hide or show all layers
- Lock or unlock all layers

### Page Management

- Navigate multi-page PDFs
- Reorder pages
- Duplicate pages
- Delete pages
- Insert pages
- Extract pages
- Rotate pages

### Export

Export the edited document while keeping the original PDF unchanged.

NestlyPDF supports:

- Original-quality export
- Compressed export
- Choosing the created and modified dates stored inside the exported PDF (desktop only, from the **PDF dates** button in the editor status bar)

Exporting keeps the document information the opened file already carried. A date you do not change stays exactly as it was.

---

## 📚 Large PDF Support

NestlyPDF is designed to remain usable with large documents.

Large PDFs use lazy page and thumbnail rendering rather than attempting to render the entire document at once.

For very large documents, NestlyPDF:

- Detects the document's page count during opening
- Prioritizes the current page
- Virtualizes the page rail
- Renders thumbnails on demand
- Cancels unnecessary offscreen rendering
- Releases rendering resources when they are no longer needed

This helps reduce startup time and memory usage, particularly on lower-powered devices.

---

## 📱 Installable & Offline

NestlyPDF is a **Progressive Web App (PWA)**.

On supported browsers, you can install it like a regular application.

Once the application shell has been installed and cached, NestlyPDF can launch and perform its local PDF editing workflow without an internet connection.

This makes it useful on:

- Desktop computers
- Laptops
- Tablets
- Phones

No separate native application is required.

---

## 🖥️ Responsive Design

NestlyPDF is designed to adapt across different screen sizes and available viewport heights.

The interface supports:

- Desktop monitors
- Laptops
- Tablets
- Large and small phones
- Short-height browser windows
- Installed PWA environments

Controls, panels, toolbars, dialogs, and inspector density adapt to the available space while preserving access to editor functionality.

---

## 🚀 Getting Started

### Requirements

- Node.js 22+
- npm

### Clone the repository

```bash
git clone https://github.com/thiagomkoppel/NestlyPDF.git
cd NestlyPDF
```

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

The development server will provide the local URL in the terminal.

---

## 🏗️ Production Build

Create a production build with:

```bash
npm run build
```

Preview it locally with:

```bash
npm run preview
```

---

## 🧪 Testing

NestlyPDF includes unit, component, integration, and browser-level tests.

### Unit and component tests

```bash
npm test
```

### Coverage

```bash
npm run test:ci
```

### End-to-end tests

```bash
npm run test:e2e
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format:check
```

Before contributing, the relevant validation checks should pass.

---

## 🧱 Tech Stack

NestlyPDF is built primarily with:

- **React**
- **TypeScript**
- **Vite**
- **PDF.js**
- **pdf-lib**
- **Vitest**
- **React Testing Library**
- **Playwright**
- **Cloudflare Workers / Static Assets**

The application is intentionally browser-local and does not require a document-processing backend.

---

## 🏛️ Architecture

NestlyPDF separates document behavior from presentation and browser/PDF infrastructure.

The project broadly follows:

```text
Domain
   ↓
Application
   ↓
Presentation
   ↓
Infrastructure / PDF adapters
```

The application/domain state is authoritative.

React components should invoke application commands rather than maintaining competing document state.

PDF edits remain represented as editor operations/overlays until export.

---

## 🛡️ Security Principles

The project follows a few important rules:

1. PDF document data stays local to the browser.
2. The original PDF remains unchanged.
3. Editing state exists only for the active local session.
4. Closing a document disposes of its active resources.
5. Document contents should not be written to application logs.
6. Shell/PWA caching must never contain user PDF data.
7. Whiteout is visual covering, **not secure redaction**.

Security and privacy regressions should be treated as release blockers.

---

## 🤝 Contributing

Contributions are welcome.

NestlyPDF is a small open-source project, and there are plenty of opportunities to improve it.

You can contribute by:

- Reporting bugs
- Suggesting features
- Improving accessibility
- Improving browser compatibility
- Improving performance
- Adding tests
- Improving documentation
- Fixing issues
- Submitting pull requests

If you're planning a larger change, opening an issue first is a good way to discuss the approach before implementation.

Please preserve the project's core principles:

- Browser-local document processing
- No required account
- No document upload dependency
- Privacy-first architecture
- Responsive behavior across supported screen sizes
- Accessible interactions
- Tests for meaningful behavior changes

---

## 🐛 Found a Bug?

If something doesn't work correctly, please open an issue and include, when possible:

- Browser and version
- Operating system
- Device type
- Whether NestlyPDF was running in the browser or as an installed PWA
- Steps to reproduce the issue
- Expected behavior
- Actual behavior

Please **do not upload private or sensitive PDF documents** when reporting an issue.

---

## 💡 Project Status

NestlyPDF is actively evolving.

It started as a small project to solve a straightforward problem: quickly edit a PDF without handing the document to an online service.

Feedback, ideas, bug reports, and contributions are welcome.

---

## 🔗 Links

**Web App:** nestlypdf.com

**Source Code:** github.com/thiagomkoppel/NestlyPDF

**Issues:** github.com/thiagomkoppel/NestlyPDF/issues

---

## 📄 License

See the repository's `LICENSE` file for the terms under which NestlyPDF is distributed.

---

**NestlyPDF — edit PDFs privately, right on your device.**

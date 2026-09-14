import type { MouseEvent } from "react";

import quickPdfMark from "../assets/brand/quickpdf-mark.svg";

const GITHUB_URL = "https:" + "//github.com/thiagomkoppel/QuickPDF";
const CONTACT_EMAIL = "thiagomkoppel@gmail.com";

const navigate = (href: string): void => {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new Event("quickpdf:navigation"));
};

const handleInternalNavigation =
  (href: string) =>
  (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    navigate(href);
  };

const sections = [
  {
    id: "overview",
    title: "1. Overview",
    body: (
      <p>
        NestlyPDF is a browser-based PDF editor. This policy explains how the application handles
        information while you open, edit, and export a PDF. Our design is intentionally local:
        document processing happens in your browser rather than on a NestlyPDF application server.
      </p>
    ),
  },
  {
    id: "documents-and-editing-data",
    title: "2. Documents and editing data",
    body: (
      <>
        <p>
          Your PDF, rendered pages, overlay elements, text, images, signatures, initials, and other
          editing state are processed in your browser memory for the active session. NestlyPDF does
          not upload PDF contents to a NestlyPDF server or store document contents in a NestlyPDF
          database.
        </p>
        <p>
          If you open a Word (.docx) file, NestlyPDF converts it to a PDF in your browser before
          editing begins. The Word file is not uploaded, and its data is released once the
          conversion finishes. Legacy .doc files are not supported.
        </p>
      </>
    ),
  },
  {
    id: "information-not-collected",
    title: "3. Information NestlyPDF does not intentionally collect",
    body: (
      <p>
        NestlyPDF does not require an account and does not intentionally collect your document
        contents, extracted text, signatures, editing data, or exported files. NestlyPDF does not
        place document contents in URLs, browser history, analytics, or error reporting.
      </p>
    ),
  },
  {
    id: "browser-storage-and-session-lifetime",
    title: "4. Browser storage and session lifetime",
    body: (
      <p>
        The active PDF and editing state are session-only. They may be lost after a page refresh,
        tab closure, browser closure, navigating away, or browser memory cleanup. NestlyPDF does not
        use LocalStorage, IndexedDB, cookies, or a document-history feature to restore your active
        document.
      </p>
    ),
  },
  {
    id: "signatures-and-sensitive-information",
    title: "5. Signatures and sensitive information",
    body: (
      <p>
        Drawn, typed, and uploaded signatures and initials can contain sensitive information. They
        are handled in the same browser-memory session as the document and are not sent to a
        NestlyPDF server. You are responsible for deciding whether your device and browser are
        appropriate for the documents you edit.
      </p>
    ),
  },
  {
    id: "exported-files",
    title: "6. Exported files",
    body: (
      <p>
        When you download an edited PDF, NestlyPDF creates the export in your browser and downloads
        it directly to your device. The downloaded file is then handled by your browser and device
        according to their normal download settings.
      </p>
    ),
  },
  {
    id: "hosting-and-technical-request-data",
    title: "7. Hosting and technical request data",
    body: (
      <p>
        NestlyPDF may be delivered through a third-party static hosting provider. That provider can
        process ordinary request metadata, such as an IP address, browser information, and request
        time, under its own policies. This technical hosting data is separate from your PDF
        contents, which NestlyPDF processes locally in your browser.
      </p>
    ),
  },
  {
    id: "cookies-analytics-and-advertising",
    title: "8. Cookies, analytics, and advertising",
    body: (
      <p>
        NestlyPDF does not use application cookies, analytics, advertising trackers, or third-party
        scripts that observe document data. A hosting provider or an external website may have its
        own policies; review those policies when you visit those services.
      </p>
    ),
  },
  {
    id: "external-links",
    title: "9. External links",
    body: (
      <p>
        NestlyPDF includes links to external websites, such as GitHub. Those sites are not operated
        by NestlyPDF, and their privacy practices apply when you follow an external link.
      </p>
    ),
  },
  {
    id: "security-and-limitations",
    title: "10. Security and limitations",
    body: (
      <p>
        Browser-local processing reduces the need to transfer document contents to an application
        server, but it cannot make every environment risk-free. Device security, browser extensions,
        shared computers, malware, and your browser configuration can affect privacy and security.
        Use NestlyPDF only on devices and browsers you trust.
      </p>
    ),
  },
  {
    id: "whiteout-is-not-redaction",
    title: "11. Whiteout is not redaction",
    body: (
      <p>
        NestlyPDF whiteout is a visual overlay used to cover content in the exported PDF. It is not
        secure redaction and must not be relied on to permanently remove sensitive information from
        the original document.
      </p>
    ),
  },
  {
    id: "childrens-privacy",
    title: "12. Children's privacy",
    body: (
      <p>
        NestlyPDF does not require accounts and does not intentionally collect personal information
        from children. Parents and guardians should supervise a child's use of any software for
        documents containing personal or sensitive information.
      </p>
    ),
  },
  {
    id: "international-use",
    title: "13. International use",
    body: (
      <p>
        NestlyPDF can be used from different locations because document processing occurs on your
        device. Static hosting providers and external websites may process technical request data in
        locations described by their own privacy policies.
      </p>
    ),
  },
  {
    id: "changes-to-this-policy",
    title: "14. Changes to this policy",
    body: (
      <p>
        We may update this policy as NestlyPDF changes. The "Last updated" date at the top of this
        page identifies the current version. Because NestlyPDF does not require accounts, we do not
        send individual policy-change notices.
      </p>
    ),
  },
  {
    id: "contact",
    title: "15. Contact",
    body: (
      <p>
        For questions about this policy or NestlyPDF, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or use the project's{" "}
        <a href={GITHUB_URL} rel="noreferrer" target="_blank">
          GitHub page
        </a>
        . Do not include private document contents when contacting the project.
      </p>
    ),
  },
] as const;

export const PrivacyPolicyPage = (): React.ReactElement => (
  <section className="privacy-policy-page" aria-labelledby="privacy-policy-title">
    <div className="privacy-policy-page__content">
      <header className="privacy-policy-page__header">
        <a
          aria-label="Go to NestlyPDF home"
          className="privacy-policy-page__brand"
          href="/"
          onClick={handleInternalNavigation("/")}
        >
          <img src={quickPdfMark} alt="" aria-hidden="true" />
          <span aria-hidden="true">NestlyPDF</span>
        </a>
        <a className="privacy-policy-page__back" href="/" onClick={handleInternalNavigation("/")}>
          Back to NestlyPDF
        </a>
      </header>

      <div className="privacy-policy-page__hero">
        <p className="privacy-policy-page__eyebrow">Private PDF workspace</p>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>Clear, local-first information about how NestlyPDF handles your documents.</p>
        <p className="privacy-policy-page__updated">Last updated: August 27, 2026</p>
      </div>

      <section className="privacy-policy-page__summary" aria-labelledby="privacy-summary-title">
        <h2 id="privacy-summary-title">Privacy at a glance</h2>
        <ul>
          <li>Your PDF is processed locally in your browser.</li>
          <li>Word (.docx) files are converted to PDF locally in your browser.</li>
          <li>NestlyPDF does not upload or store your document on its own servers.</li>
          <li>No account is required.</li>
          <li>No analytics or advertising trackers are used.</li>
          <li>Closing or refreshing the page may permanently discard your editing session.</li>
        </ul>
      </section>

      <div className="privacy-policy-page__layout">
        <nav className="privacy-policy-page__toc" aria-label="Privacy policy contents">
          <h2>Contents</h2>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="privacy-policy-page__article">
          {sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  </section>
);

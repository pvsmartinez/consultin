/**
 * Global test setup — runs before every test file.
 * Imports @testing-library/jest-dom so custom matchers like
 * toBeInTheDocument(), toHaveValue(), etc. are available everywhere.
 */
import '@testing-library/jest-dom'

// jsdom doesn't implement scrollIntoView — stub it out globally
window.HTMLElement.prototype.scrollIntoView = function () {}

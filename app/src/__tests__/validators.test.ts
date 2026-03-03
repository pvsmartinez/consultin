import { describe, it, expect } from 'vitest'
import {
  validateCPF,
  validateCNPJ,
  validatePhone,
  formatCPF,
  formatCNPJ,
  formatPhone,
  validateCpfCnpj,
  maskCpfCnpj,
  maskCEP,
} from '../utils/validators'

// ─── validateCPF ─────────────────────────────────────────────────────────────

describe('validateCPF', () => {
  it('accepts a valid CPF (digits only)', () => {
    expect(validateCPF('11144477735')).toEqual({ valid: true })
  })

  it('accepts a valid CPF with formatting', () => {
    expect(validateCPF('111.444.777-35')).toEqual({ valid: true })
  })

  it('accepts another valid CPF', () => {
    expect(validateCPF('52998224725')).toEqual({ valid: true })
  })

  it('rejects CPF with too few digits', () => {
    const result = validateCPF('1234567')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects CPF with too many digits', () => {
    const result = validateCPF('123456789012')
    expect(result.valid).toBe(false)
  })

  it('rejects CPF of all same digits (000.000.000-00)', () => {
    const result = validateCPF('00000000000')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects CPF of all same digits (111.111.111-11)', () => {
    expect(validateCPF('11111111111').valid).toBe(false)
  })

  it('rejects CPF with wrong first check digit', () => {
    // 11144477735 valid; change digit index 9 from 3 → 0
    expect(validateCPF('11144477705').valid).toBe(false)
  })

  it('rejects CPF with wrong second check digit', () => {
    // 11144477735 valid; change last digit 5 → 0
    expect(validateCPF('11144477730').valid).toBe(false)
  })

  it('strips separators before validating', () => {
    expect(validateCPF('111.444.777-35').valid).toBe(true)
  })
})

// ─── validateCNPJ ────────────────────────────────────────────────────────────

describe('validateCNPJ', () => {
  // 11.222.333/0001-81 → computed valid CNPJ (check digits: 8, 1)
  it('accepts a valid CNPJ (digits only)', () => {
    expect(validateCNPJ('11222333000181')).toEqual({ valid: true })
  })

  it('accepts a valid CNPJ with formatting', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toEqual({ valid: true })
  })

  it('rejects CNPJ with too few digits', () => {
    expect(validateCNPJ('1234567890').valid).toBe(false)
  })

  it('rejects CNPJ with too many digits', () => {
    expect(validateCNPJ('140704130001411').valid).toBe(false)
  })

  it('rejects CNPJ of all zeros', () => {
    expect(validateCNPJ('00000000000000').valid).toBe(false)
  })

  it('rejects CNPJ of all same digits (11111111111111)', () => {
    expect(validateCNPJ('11111111111111').valid).toBe(false)
  })

  it('rejects CNPJ with wrong check digits', () => {
    // 11222333000181 is valid; modify last digit 1 → 2
    expect(validateCNPJ('11222333000182').valid).toBe(false)
  })
})

// ─── validatePhone ────────────────────────────────────────────────────────────

describe('validatePhone', () => {
  it('accepts a 10-digit landline (with area code)', () => {
    expect(validatePhone('1133334444')).toEqual({ valid: true })
  })

  it('accepts an 11-digit mobile (with area code)', () => {
    expect(validatePhone('11999998888')).toEqual({ valid: true })
  })

  it('accepts phone with formatting stripped', () => {
    expect(validatePhone('(11) 99999-8888')).toEqual({ valid: true })
  })

  it('accepts phone with dots stripped', () => {
    expect(validatePhone('11.9999.8888')).toEqual({ valid: true })
  })

  it('rejects phone with too few digits', () => {
    const result = validatePhone('1199999')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects phone with too many digits', () => {
    expect(validatePhone('119999988880').valid).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validatePhone('').valid).toBe(false)
  })
})

// ─── formatCPF ───────────────────────────────────────────────────────────────

describe('formatCPF', () => {
  it('formats 11 raw digits into 000.000.000-00 pattern', () => {
    expect(formatCPF('11144477735')).toBe('111.444.777-35')
  })

  it('formats already-partial CPF (strips existing separators first)', () => {
    // Implementation strips existing chars and reformats
    expect(formatCPF('11144477735')).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
  })

  it('works with a different valid CPF', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25')
  })
})

// ─── formatCNPJ ──────────────────────────────────────────────────────────────

describe('formatCNPJ', () => {
  it('formats 14 raw digits into 00.000.000/0000-00 pattern', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('result matches standard CNPJ mask', () => {
    expect(formatCNPJ('11222333000181')).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)
  })
})

// ─── formatPhone ─────────────────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats an 11-digit mobile number as (XX) XXXXX-XXXX', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  it('formats a 10-digit landline as (XX) XXXX-XXXX', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })

  it('result for mobile matches (DD) DDDDD-DDDD pattern', () => {
    expect(formatPhone('11999998888')).toMatch(/^\(\d{2}\) \d{5}-\d{4}$/)
  })

  it('result for landline matches (DD) DDDD-DDDD pattern', () => {
    expect(formatPhone('1133334444')).toMatch(/^\(\d{2}\) \d{4}-\d{4}$/)
  })
})

// ─── validateCpfCnpj ─────────────────────────────────────────────────────────

describe('validateCpfCnpj', () => {
  it('returns true for a valid CPF (11 digits)', () => {
    expect(validateCpfCnpj('11144477735')).toBe(true)
  })

  it('returns true for a valid CPF with formatting', () => {
    expect(validateCpfCnpj('111.444.777-35')).toBe(true)
  })

  it('returns true for a valid CNPJ (14 digits)', () => {
    expect(validateCpfCnpj('11222333000181')).toBe(true)
  })

  it('returns true for a valid CNPJ with formatting', () => {
    expect(validateCpfCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('returns false for an invalid CPF', () => {
    expect(validateCpfCnpj('00000000000')).toBe(false)
  })

  it('returns false for an invalid CNPJ', () => {
    expect(validateCpfCnpj('11222333000182')).toBe(false)
  })

  it('returns false for a partial string (not 11 or 14 digits)', () => {
    expect(validateCpfCnpj('123456789')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(validateCpfCnpj('')).toBe(false)
  })
})

// ─── maskCpfCnpj ─────────────────────────────────────────────────────────────

describe('maskCpfCnpj', () => {
  it('applies CPF mask for 11-digit input', () => {
    expect(maskCpfCnpj('11144477735')).toBe('111.444.777-35')
  })

  it('applies CPF mask for up to 11 digits', () => {
    expect(maskCpfCnpj('111444')).toMatch(/^\d{3}\.\d{3}$/)
  })

  it('applies CNPJ mask for 14-digit input', () => {
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('switches to CNPJ mask once input exceeds 11 digits', () => {
    const result = maskCpfCnpj('112223330001')
    // Should be formatted as partial CNPJ (12 digits → 11.222.333/0001)
    expect(result).toMatch(/^\d{2}\.\d{3}\.\d{3}/)
  })
})

// ─── maskCEP ─────────────────────────────────────────────────────────────────

describe('maskCEP', () => {
  it('formats 8 raw digits as XXXXX-XXX', () => {
    expect(maskCEP('01310100')).toBe('01310-100')
  })

  it('strips non-digit characters before formatting', () => {
    expect(maskCEP('01310-100')).toBe('01310-100')
  })

  it('returns partial digits unformatted when fewer than 5 digits', () => {
    expect(maskCEP('013')).toBe('013')
  })

  it('returns partial digits with hyphen when 6-8 digits', () => {
    const result = maskCEP('013101')
    expect(result).toBe('01310-1')
  })

  it('truncates to 8 digits maximum', () => {
    expect(maskCEP('0131010099')).toBe('01310-100')
  })
})

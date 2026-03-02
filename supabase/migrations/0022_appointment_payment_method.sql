-- 0022: Add manual payment_method to appointments
-- Used for manual payment tracking in the Financeiro module (no gateway involved).
-- Values are the common payment methods used by Brazilian clinics.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IN ('cash','pix','credit_card','debit_card','insurance','boleto','other')
           OR payment_method IS NULL);

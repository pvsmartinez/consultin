import jsPDF from 'jspdf'
import type { Clinic, Patient, PatientClinicalItem } from '../types'
import { CLINICAL_ITEM_TYPE_LABELS } from '../types'
import { getClinicDocumentTemplate, interpolateClinicalDocumentTemplate } from './clinicalDocumentTemplates'
import { formatDate } from './date'

type PatientForDoc = Pick<Patient,
  'name' | 'cpf' | 'birthDate' |
  'addressStreet' | 'addressNumber' | 'addressNeighborhood' |
  'addressCity' | 'addressState' | 'addressZip'
>

interface PatientClinicalDocumentContext {
  item: PatientClinicalItem
  patient: PatientForDoc
  clinic: Pick<Clinic, 'name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'documentTemplates' | 'documentSigning'> | null
  professional?: { name: string | null; council: string | null }
}

export function resolvePatientClinicalDocumentBodySource(
  item: PatientClinicalItem,
  clinic: Pick<Clinic, 'documentTemplates'> | null,
) {
  const printableBody = item.metadata.printableBody?.trim()
  if (printableBody) return printableBody

  const clinicTemplate = getClinicDocumentTemplate(clinic?.documentTemplates, item.itemType).trim()
  if (clinicTemplate) return clinicTemplate

  if (item.description?.trim()) return item.description.trim()
  if (item.notes?.trim()) return item.notes.trim()
  return ''
}

export function buildPatientClinicalDocumentBody(
  item: PatientClinicalItem,
  patient: PatientForDoc,
  clinic: Pick<Clinic, 'name' | 'phone' | 'city' | 'state' | 'documentTemplates' | 'documentSigning'> | null,
  issueDate: string,
  professional?: { name: string | null; council: string | null },
) {
  const source = resolvePatientClinicalDocumentBodySource(item, clinic)
  if (!source) return ''

  return interpolateClinicalDocumentTemplate(source, {
    item,
    patient,
    clinic,
    issueDate,
    professional,
  }).trim()
}

function fileNameFor(item: PatientClinicalItem, patientName: string) {
  const safePatient = patientName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  const safeTitle = item.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  return `${safeTitle || 'documento'}-${safePatient || 'paciente'}.pdf`
}

function createDocument({ item, patient, clinic, professional }: PatientClinicalDocumentContext) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const reviewNotes = item.metadata.reviewNotes?.trim()
  const issueDate = item.issuedOn ? formatDate(`${item.issuedOn}T00:00:00`) : formatDate(new Date().toISOString())
  const body = buildPatientClinicalDocumentBody(item, patient, clinic, issueDate, professional)

  // — Clinic header —
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(clinic?.name ?? 'Consultin', margin, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const clinicLine = [clinic?.address, clinic?.city && clinic?.state ? `${clinic.city} - ${clinic.state}` : clinic?.city, clinic?.phone, clinic?.email]
    .filter(Boolean)
    .join(' · ')
  if (clinicLine) doc.text(clinicLine, margin, 24)

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, 28, pageWidth - margin, 28)

  // — Document title + date —
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(item.title, margin, 38)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(CLINICAL_ITEM_TYPE_LABELS[item.itemType], margin, 44)
  doc.text(`Emitido em: ${issueDate}`, pageWidth - margin, 44, { align: 'right' })

  // — Dentist section (name + council) —
  const signing = clinic?.documentSigning
  const dentistName = professional?.name || signing?.signerName || null
  const dentistCouncil = professional?.council || signing?.signerCouncil || null
  let patientBoxY = 50

  if (dentistName || dentistCouncil) {
    if (dentistName) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(dentistName, margin, 52)
    }
    if (dentistCouncil) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139)
      doc.text(dentistCouncil, margin, dentistName ? 58 : 52)
      doc.setTextColor(15, 23, 42)
    }
    patientBoxY = dentistName && dentistCouncil ? 64 : 58
  }

  // — Patient box —
  const addressLines: string[] = [
    [patient.addressStreet, patient.addressNumber].filter(Boolean).join(', '),
    patient.addressNeighborhood ?? null,
    patient.addressCity && patient.addressState
      ? `${patient.addressCity} - ${patient.addressState}${patient.addressZip ? ` — CEP: ${patient.addressZip}` : ''}`
      : patient.addressCity ?? patient.addressState ?? null,
  ].filter((l): l is string => !!l && l.trim().length > 0)

  const cpfLine = patient.cpf ? `CPF: ${patient.cpf}` : null
  const patientBoxHeight = 6 + 6 + 6 + (addressLines.length * 5.5) + (cpfLine ? 5.5 : 0) + 4

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, patientBoxY, contentWidth, patientBoxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('PACIENTE', margin + 4, patientBoxY + 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(patient.name, margin + 4, patientBoxY + 12)

  let lineY = patientBoxY + 17.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const addrLine of addressLines) {
    doc.text(addrLine, margin + 4, lineY)
    lineY += 5.5
  }
  if (cpfLine) {
    doc.text(cpfLine, margin + 4, lineY)
    lineY += 5.5
  }

  // — Body text —
  const bodyStartY = patientBoxY + patientBoxHeight + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  const contentLines = doc.splitTextToSize(body || 'Documento sem conteúdo para impressão.', contentWidth)
  doc.text(contentLines, margin, bodyStartY)

  let currentY = bodyStartY + contentLines.length * 5

  if (reviewNotes) {
    currentY += 8
    doc.setFont('helvetica', 'bold')
    doc.text('Observações de revisão', margin, currentY)
    doc.setFont('helvetica', 'normal')
    const reviewLines = doc.splitTextToSize(reviewNotes, contentWidth)
    doc.text(reviewLines, margin, currentY + 6)
    currentY += 6 + reviewLines.length * 5
  }

  return { doc, fileName: fileNameFor(item, patient.name) }
}

export function downloadPatientClinicalDocumentPdf(context: PatientClinicalDocumentContext) {
  const { doc, fileName } = createDocument(context)
  doc.save(fileName)
}

export function printPatientClinicalDocument(context: PatientClinicalDocumentContext) {
  const { doc } = createDocument(context)
  doc.autoPrint()
  const url = doc.output('bloburl')
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function hasPrintableClinicalContent(
  item: PatientClinicalItem,
  clinic?: Pick<Clinic, 'documentTemplates'> | null,
) {
  return Boolean(resolvePatientClinicalDocumentBodySource(item, clinic ?? null).trim())
}
import jsPDF from 'jspdf'
import type { Clinic, Patient, PatientClinicalItem } from '../types'
import { CLINICAL_ITEM_TYPE_LABELS } from '../types'
import { getClinicDocumentTemplate, interpolateClinicalDocumentTemplate } from './clinicalDocumentTemplates'
import { formatDate } from './date'

interface PatientClinicalDocumentContext {
  item: PatientClinicalItem
  patient: Pick<Patient, 'name' | 'cpf' | 'birthDate'>
  clinic: Pick<Clinic, 'name' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'documentTemplates' | 'documentSigning'> | null
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
  patient: Pick<Patient, 'name' | 'cpf' | 'birthDate'>,
  clinic: Pick<Clinic, 'name' | 'phone' | 'city' | 'state' | 'documentTemplates' | 'documentSigning'> | null,
  issueDate: string,
) {
  const source = resolvePatientClinicalDocumentBodySource(item, clinic)
  if (!source) return ''

  return interpolateClinicalDocumentTemplate(source, {
    item,
    patient,
    clinic,
    issueDate,
  }).trim()
}

function fileNameFor(item: PatientClinicalItem, patientName: string) {
  const safePatient = patientName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  const safeTitle = item.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  return `${safeTitle || 'documento'}-${safePatient || 'paciente'}.pdf`
}

function createDocument({ item, patient, clinic }: PatientClinicalDocumentContext) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  const reviewNotes = item.metadata.reviewNotes?.trim()
  const issueDate = item.issuedOn ? formatDate(`${item.issuedOn}T00:00:00`) : formatDate(new Date().toISOString())
  const body = buildPatientClinicalDocumentBody(item, patient, clinic, issueDate)

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

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(item.title, margin, 38)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(CLINICAL_ITEM_TYPE_LABELS[item.itemType], margin, 44)
  doc.text(`Emitido em: ${issueDate}`, pageWidth - margin, 44, { align: 'right' })

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, 50, contentWidth, 24, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('Paciente', margin + 4, 57)
  doc.setFont('helvetica', 'normal')
  doc.text(patient.name, margin + 4, 63)

  const patientDetails = [
    patient.cpf ? `CPF: ${patient.cpf}` : null,
    patient.birthDate ? `Nascimento: ${formatDate(`${patient.birthDate}T00:00:00`)}` : null,
  ].filter(Boolean).join(' · ')
  if (patientDetails) {
    doc.text(patientDetails, margin + 4, 69)
  }

  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  const contentLines = doc.splitTextToSize(body || 'Documento sem conteúdo para impressão.', contentWidth)
  doc.text(contentLines, margin, 86)

  let currentY = 86 + contentLines.length * 5

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
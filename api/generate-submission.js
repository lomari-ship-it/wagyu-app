const ExcelJS = require('exceljs')

// Template layout (matching DNA_Paternity_Test_Form.xlsx exactly):
// Row 1:  spacer (7.95)
// Row 2:  NSBA logo area (30) - A2:M2 merged, image placeholder
// Row 3:  spacer (13.95)
// Row 4:  spacer (16.05)
// Row 5:  "Paternity Tests: Animals" title (16.05) - A5:M6 merged, bold size 20
// Row 6:  (part of merge)
// Row 7:  Owner row (6) - label A7:A8, value B7:D8, right: K7:M8
// Row 8:  (part of merges)
// Row 9:  Farm Name row (6) - A9:A10, B9:D10, right: I8:I9 Address, K9:M10
// Row 10: (part of merges)
// Row 11: Tel row (6) - A11:A12, B11:D12, right: K11:M12
// Row 12: (part of merges)
// Row 13: Fax/email row (6) - A13:A14, B13:D14, right: I13:I14, K13:M14
// Row 14: (part of merges)
// Row 15: Member No row (6) - A15:A16, B15:D16, right: I15:I16, K15:M16
// Row 16: (part of merges)
// Row 17: spacer (16.05)
// Row 18: Column headers (16.05)
// Rows 19-34: Data rows (15 each) - 16 rows
// Row 35: spacer (15)
// Row 36: Result to / Account to (15) - A36:A37, B36:D37, I36:I37, J36:M37
// Row 37: (part of merges)
// Row 38: Signed / Date (15) - A38:A39, B38:D39, I38:I39, J38:M39
// Row 39: (part of merges)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return }

  let body
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body }
  catch (e) { res.status(400).send('Invalid JSON'); return }

  const calves = body.calves || []
  const batchInfo = body.batch || {}
  const batchDate = batchInfo.created_at
    ? new Date(batchInfo.created_at).toLocaleDateString('en-ZA')
    : new Date().toLocaleDateString('en-ZA')

  const FARM_OWNER = 'J.A Delport'
  const FARM_NAME = 'Farm JanMie'
  const FARM_NUMBER = 'Farm JanMie No. 1007'
  const MEMBER_NO = 'F10091'
  const TEL = '+264 81 124 0123'
  const EMAIL = 'andre@rampoint.info'
  const ADDRESS_REGION = 'Omaheke'
  const COUNTRY = 'Namibia'
  const DATA_FONT = 'Aptos Display'

  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Wagyu Herd Management'

    const ROWS_PER_PAGE = 16
    const totalPages = Math.max(1, Math.ceil(calves.length / ROWS_PER_PAGE))

    for (let page = 0; page < totalPages; page++) {
      const pageCalves = calves.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)
      const sheetName = totalPages === 1 ? 'Paternity Test Form' : 'Page ' + (page + 1)
      const ws = wb.addWorksheet(sheetName, {
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
      })

      // Column widths matching template exactly
      ws.getColumn('A').width = 13.77734375
      ws.getColumn('B').width = 13.0
      ws.getColumn('C').width = 8.5
      ws.getColumn('D').width = 9.0
      ws.getColumn('E').width = 5.5
      ws.getColumn('F').width = 0.5546875   // narrow spacer
      ws.getColumn('G').width = 13.77734375
      ws.getColumn('H').width = 8.5
      ws.getColumn('I').width = 9.0
      ws.getColumn('J').width = 0.5546875   // narrow spacer
      ws.getColumn('K').width = 13.77734375
      ws.getColumn('L').width = 8.5
      ws.getColumn('M').width = 9.0

      // Row heights matching template
      ws.getRow(1).height = 7.95
      ws.getRow(2).height = 30.0
      ws.getRow(3).height = 13.95
      ws.getRow(4).height = 16.05
      ws.getRow(5).height = 16.05
      ws.getRow(6).height = 16.05
      ws.getRow(7).height = 6.0
      ws.getRow(8).height = 16.05
      ws.getRow(9).height = 6.0
      ws.getRow(10).height = 16.05
      ws.getRow(11).height = 6.0
      ws.getRow(12).height = 16.05
      ws.getRow(13).height = 6.0
      ws.getRow(14).height = 16.05
      ws.getRow(15).height = 6.0
      ws.getRow(16).height = 16.05
      ws.getRow(17).height = 16.05
      ws.getRow(18).height = 16.05
      for (let r = 19; r <= 42; r++) ws.getRow(r).height = 15.0

      // Helpers
      const f = (bold, size) => ({ name: DATA_FONT, bold: !!bold, size: size || 11 })
      const thinB = { style: 'thin' }
      const medB = { style: 'medium' }
      const bdrBottom = { bottom: thinB }
      const bdrTopBottom = { top: thinB, bottom: thinB }
      const bdrDataHeader = { left: medB, right: thinB, top: medB, bottom: medB }
      const bdrDataHeaderMid = { left: thinB, right: thinB, top: medB, bottom: medB }
      const bdrDataHeaderRight = { left: thinB, right: medB, top: medB, bottom: medB }
      const bdrDataCell = { left: medB, right: thinB, bottom: thinB }
      const bdrDataCellMid = { left: thinB, right: thinB, bottom: thinB }
      const bdrDataCellRight = { left: thinB, right: medB, bottom: thinB }
      const bdrDataCellRightMed = { left: medB, right: medB, bottom: thinB }
      const alignCenter = { vertical: 'center' }
      const alignCenterH = { horizontal: 'center', vertical: 'center' }

      function setCell(coord, value, font, border, alignment) {
        const cell = ws.getCell(coord)
        if (value !== undefined) cell.value = value
        if (font) cell.font = font
        if (border) cell.border = border
        if (alignment) cell.alignment = alignment
        return cell
      }

      // Row 2: NSBA area (logo would go here - just merge for now)
      ws.mergeCells('A2:M2')
      setCell('A2', 'NAMIBIA STUD BREEDERS ASSOCIATION', f(true, 9), null, { horizontal: 'center', vertical: 'center' })

      // Row 5-6: Title
      ws.mergeCells('A5:M6')
      setCell('A5', 'Paternity Tests: Animals', f(true, 20), null, { horizontal: 'center', vertical: 'center' })

      // Row 7-8: Owner / Farm Number
      ws.mergeCells('A7:A8')
      ws.mergeCells('B7:D8')
      ws.mergeCells('K7:M8')
      setCell('A7', 'Owner :', f(true), null, alignCenter)
      setCell('B7', FARM_OWNER, f(false), bdrBottom, alignCenter)
      setCell('K7', FARM_NUMBER, f(false), bdrBottom, alignCenter)

      // Row 9-10: Farm Name / Address / Region
      ws.mergeCells('A9:A10')
      ws.mergeCells('B9:D10')
      ws.mergeCells('I8:I9')
      ws.mergeCells('K9:M10')
      setCell('A9', 'Farm Name :', f(true), null, alignCenter)
      setCell('B9', FARM_NAME, f(false), bdrBottom, alignCenter)
      setCell('I8', 'Address :', f(true), null, alignCenter)
      setCell('K9', ADDRESS_REGION, f(false), bdrTopBottom, alignCenter)

      // Row 11-12: Tel / Country
      ws.mergeCells('A11:A12')
      ws.mergeCells('B11:D12')
      ws.mergeCells('K11:M12')
      setCell('A11', 'Tel :', f(true), null, alignCenter)
      setCell('B11', TEL, f(false), bdrBottom, alignCenter)
      setCell('K11', COUNTRY, f(false), bdrTopBottom, alignCenter)

      // Row 13-14: Fax / Email
      ws.mergeCells('A13:A14')
      ws.mergeCells('B13:D14')
      ws.mergeCells('I13:I14')
      ws.mergeCells('K13:M14')
      setCell('A13', 'Fax :', f(true), null, alignCenter)
      setCell('B13', '', f(false), bdrBottom, alignCenter)
      setCell('I13', 'e-mail :', f(true), null, alignCenter)
      setCell('K13', EMAIL, f(false), bdrTopBottom, alignCenter)

      // Row 15-16: Member No / Book Entry No
      ws.mergeCells('A15:A16')
      ws.mergeCells('B15:D16')
      ws.mergeCells('I15:I16')
      ws.mergeCells('K15:M16')
      setCell('A15', 'Member No. :', f(true), null, alignCenter)
      setCell('B15', MEMBER_NO, f(false), bdrBottom, alignCenter)
      setCell('I15', 'Book Entry No. :', f(true), null, alignCenter)
      setCell('K15', batchInfo.batch_report_number || '', f(false), bdrBottom, alignCenter)

      // Row 17: page indicator if multi-page
      if (totalPages > 1) {
        ws.mergeCells('A17:M17')
        setCell('A17', 'Page ' + (page + 1) + ' of ' + totalPages, f(false, 10), null, { horizontal: 'center', vertical: 'center' })
      }

      // Row 18: Column headers
      setCell('A18', 'Breed', f(true), { left: medB, right: thinB, top: medB, bottom: medB }, alignCenterH)
      setCell('B18', 'Calf ear no.', f(true), bdrDataHeaderMid, alignCenterH)
      setCell('C18', 'Lab#', f(true), bdrDataHeaderMid, alignCenterH)
      setCell('D18', 'D.O.B', f(true), bdrDataHeaderMid, alignCenterH)
      setCell('E18', 'Sex', f(true), { left: thinB, right: medB, top: medB, bottom: medB }, alignCenterH)
      // F18 is narrow spacer - merge F18:F34
      setCell('G18', 'Dam', f(true), { left: medB, right: thinB, top: medB, bottom: medB }, alignCenterH)
      setCell('H18', 'Lab#', f(true), bdrDataHeaderMid, alignCenterH)
      setCell('I18', 'Reg#', f(true), { left: thinB, right: medB, top: medB, bottom: medB }, alignCenterH)
      // J18 is narrow spacer - merge J18:J34
      setCell('K18', '?Sire/s', f(true), { left: medB, right: thinB, top: medB, bottom: medB }, alignCenterH)
      setCell('L18', 'Lab#', f(true), bdrDataHeaderMid, alignCenterH)
      setCell('M18', 'Reg#', f(true), { left: thinB, right: medB, top: medB, bottom: medB }, alignCenterH)

      // Merge spacer columns F and J for data rows 18-34
      ws.mergeCells('F18:F34')
      ws.mergeCells('J18:J34')

      // Rows 19-34: Data rows
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const calf = pageCalves[i]
        const rn = 19 + i
        // Apply borders to all data cells
        setCell('A' + rn, calf ? (calf.breed || '') : '', f(false), bdrDataCell, alignCenterH)
        setCell('B' + rn, calf ? (calf.ear_tag || calf.identity_number || calf.identityNumber || '') : '', f(false), bdrDataCellMid, alignCenterH)
        setCell('C' + rn, '', f(false), bdrDataCellMid, alignCenterH)
        setCell('D' + rn, calf && calf.birth_date ? fmtDOB(calf.birth_date) : (calf && calf.birthDate ? fmtDOB(calf.birthDate) : ''), f(false), bdrDataCellMid, alignCenterH)
        setCell('E' + rn, calf ? (calf.sex || '') : '', f(false), { left: thinB, right: medB, bottom: thinB }, alignCenterH)
        setCell('G' + rn, calf ? (calf.dam_id || calf.mother_id || '') : '', f(false), bdrDataCell, alignCenterH)
        setCell('H' + rn, '', f(false), bdrDataCellMid, alignCenterH)
        setCell('I' + rn, '', f(false), { left: thinB, right: medB, bottom: thinB }, alignCenterH)
        setCell('K' + rn, calf ? (calf.sire_id || calf.father_id || '') : '', f(false), bdrDataCell, alignCenterH)
        setCell('L' + rn, '', f(false), bdrDataCellMid, alignCenterH)
        setCell('M' + rn, '', f(false), { left: thinB, right: medB, bottom: thinB }, alignCenterH)
      }

      // Rows 36-37: Result to / Account to
      ws.mergeCells('A36:A37')
      ws.mergeCells('B36:D37')
      ws.mergeCells('I36:I37')
      ws.mergeCells('J36:M37')
      setCell('A36', 'Result to :', f(false), null, alignCenter)
      setCell('I36', 'Account to :', f(false), null, alignCenter)

      // Rows 38-39: Signed / Date
      ws.mergeCells('A38:A39')
      ws.mergeCells('B38:D39')
      ws.mergeCells('I38:I39')
      ws.mergeCells('J38:M39')
      setCell('A38', 'Signed :', f(false), null, alignCenter)
      setCell('I38', 'Date :', f(false), null, alignCenter)
      setCell('J38', batchDate, f(false), null, alignCenter)

      ws.pageSetup.margins = { left: 0.315, right: 0.315, top: 0.354, bottom: 0.354, header: 0.12, footer: 0.12 }
    }

    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="batch_submission_' + (batchInfo.id || 'draft') + '.xlsx"')
    res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    console.error('Submission form error:', err)
    res.status(500).send('Generation failed: ' + err.message)
  }
}

function fmtDOB(d) {
  if (!d) return ''
  const p = d.split('-')
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d
    }

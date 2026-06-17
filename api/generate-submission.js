const ExcelJS = require('exceljs')
const templateB64 = require('../netlify/functions/submission_template_b64')

const HEADER_ROWS = 17
const COL_HEADER_ROW = 18
const DATA_START_ROW = 19
const DATA_ROWS_PER_PAGE = 16
const FOOTER_START_ROW = 36
const PAGE_HEIGHT = 39

const FARM_OWNER = 'J.A Delport'
const FARM_NAME = 'Farm JanMie'
const FARM_NUMBER = 'Farm JanMie No. 1007'
const MEMBER_NO = 'F10091'
const TEL = '+264 81 124 0123'
const EMAIL = 'andre@rampoint.info'
const ADDRESS_REGION = 'Omaheke'
const COUNTRY = 'Namibia'

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
  try {
    const templateBuffer = Buffer.from(templateB64, 'base64')
    const templateWb = new ExcelJS.Workbook()
    await templateWb.xlsx.load(templateBuffer)
    const templateWs = templateWb.getWorksheet(1)
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Wagyu Herd Management'
    const totalPages = Math.max(1, Math.ceil(calves.length / DATA_ROWS_PER_PAGE))
    for (let page = 0; page < totalPages; page++) {
      const pageCalves = calves.slice(page * DATA_ROWS_PER_PAGE, (page + 1) * DATA_ROWS_PER_PAGE)
      const sheetName = totalPages === 1 ? 'Batch Submission' : 'Page ' + (page + 1)
      const ws = wb.addWorksheet(sheetName)
      copyTemplateStructure(templateWs, ws)
      fillHeader(ws, batchInfo, batchDate, page + 1, totalPages)
      for (let i = 0; i < pageCalves.length; i++) {
        fillAnimalRow(ws, DATA_START_ROW + i, pageCalves[i], templateWs)
      }
      ws.pageSetup.orientation = 'landscape'
      ws.pageSetup.paperSize = 9
      ws.pageSetup.fitToPage = true
      ws.pageSetup.fitToWidth = 1
      ws.pageSetup.fitToHeight = 1
      ws.pageSetup.margins = { left: 0.315, right: 0.315, top: 0.354, bottom: 0.354, header: 0.12, footer: 0.12 }
    }
    const buffer = await wb.xlsx.writeBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="batch_submission_' + (batchInfo.id || 'draft') + '.xlsx"')
    res.status(200).send(Buffer.from(base64, 'base64'))
  } catch (err) {
    console.error('Submission form generation error:', err)
    res.status(500).send('Generation failed: ' + err.message)
  }
}

function copyTemplateStructure(src, dest) {
  src.columns.forEach((col, idx) => {
    const destCol = dest.getColumn(idx + 1)
    if (col.width) destCol.width = col.width
  })
  for (let r = 1; r <= PAGE_HEIGHT; r++) {
    const srcRow = src.getRow(r)
    const destRow = dest.getRow(r)
    if (srcRow.height) destRow.height = srcRow.height
    srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const destCell = dest.getCell(r, colNumber)
      if (r < DATA_START_ROW || r >= FOOTER_START_ROW) destCell.value = cell.value
      try { destCell.style = JSON.parse(JSON.stringify(cell.style)) } catch (e) {}
    })
  }
  if (src._merges) Object.keys(src._merges).forEach(key => { try { dest.mergeCells(key) } catch (e) {} })
}

function fillHeader(ws, batchInfo, batchDate, pageNum, totalPages) {
  ws.getCell('B7').value = FARM_OWNER
  ws.getCell('K7').value = FARM_NUMBER
  ws.getCell('B9').value = FARM_NAME
  ws.getCell('K9').value = ADDRESS_REGION
  ws.getCell('B11').value = TEL
  ws.getCell('K11').value = COUNTRY
  ws.getCell('K13').value = EMAIL
  ws.getCell('B15').value = MEMBER_NO
  const batchRef = batchInfo.batch_number ? 'Batch ' + batchInfo.batch_number
    : batchInfo.id ? 'Batch ' + String(batchInfo.id).substring(0, 8) : ''
  ws.getCell('J15').value = batchRef + (totalPages > 1 ? '  (Page ' + pageNum + ' of ' + totalPages + ')' : '')
  ws.getCell('J38').value = batchDate
}

function fillAnimalRow(ws, rowNum, calf, templateWs) {
  const destRow = ws.getRow(rowNum)
  templateWs.getRow(DATA_START_ROW).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    try { destRow.getCell(colNumber).style = JSON.parse(JSON.stringify(cell.style)) } catch (e) {}
  })
  destRow.getCell('A').value = calf.breed || 'Wagyu'
  destRow.getCell('B').value = calf.ear_tag || calf.identity_number || ''
  if (calf.birth_date) destRow.getCell('D').value = formatDOB(calf.birth_date)
  destRow.getCell('E').value = calf.sex || ''
  destRow.getCell('G').value = calf.mother_id || ''
  destRow.getCell('K').value = calf.father_id || ''
  destRow.commit()
}

function formatDOB(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : dateStr
}

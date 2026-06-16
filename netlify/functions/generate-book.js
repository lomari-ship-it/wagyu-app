const ExcelJS = require('exceljs')
const path = require('path')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let calves
  try {
    calves = JSON.parse(event.body || '[]')
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const templatePath = path.join(__dirname, 'Book2.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const ws = workbook.getWorksheet('birth notification')
  const START_ROW = 4

  for (let i = 0; i < calves.length; i++) {
    const calf = calves[i]
    const row = START_ROW + i

    // Copy formula row structure if beyond row 4
    if (row > START_ROW) {
      const templateRow = ws.getRow(START_ROW)
      const newRow = ws.getRow(row)
      templateRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const newCell = newRow.getCell(colNumber)
        if (typeof cell.value === 'object' && cell.value && cell.value.formula) {
          newCell.value = { formula: cell.value.formula.replace(new RegExp(START_ROW, 'g'), row) }
        }
        if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style))
      })
    }

    // Parse birth date
    let day = '', month = '', year = ''
    if (calf.birth_date) {
      const parts = calf.birth_date.split('-')
      if (parts.length === 3) { year = parts[0]; month = parts[1]; day = parts[2] }
    }

    const identity = calf.identity_number || calf.ear_tag || ''

    ws.getRow(row).getCell('C').value = identity
    ws.getRow(row).getCell('E').value = day
    ws.getRow(row).getCell('F').value = month
    ws.getRow(row).getCell('G').value = year
    ws.getRow(row).getCell('I').value = calf.sex || ''
    ws.getRow(row).getCell('K').value = calf.calf_details || 'Single'
    ws.getRow(row).getCell('R').value = identity
    ws.getRow(row).getCell('U').value = calf.father_id || ''
    ws.getRow(row).getCell('X').value = calf.mother_id || ''
    if (calf.birth_mass) ws.getRow(row).getCell('AH').value = parseFloat(calf.birth_mass)
    ws.getRow(row).getCell('AJ').value = calf.color || ''
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="birth_notification.xlsx"',
      'Content-Encoding': 'base64',
    },
    body: base64,
    isBase64Encoded: true,
  }
}

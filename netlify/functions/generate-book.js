const path = require('path')
const fs = require('fs')

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

  try {
    const ExcelJS = require('exceljs')
    const templatePath = path.join(__dirname, 'Book2.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    const ws = workbook.getWorksheet('birth notification')
    const START_ROW = 4

    for (let i = 0; i < calves.length; i++) {
      const calf = calves[i]
      const row = START_ROW + i

      if (row > START_ROW) {
        const templateRow = ws.getRow(START_ROW)
        const newRow = ws.getRow(row)
        templateRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const newCell = newRow.getCell(colNumber)
          if (typeof cell.value === 'object' && cell.value && cell.value.formula) {
            newCell.value = { formula: cell.value.formula.replace(new RegExp(String(START_ROW), 'g'), String(row)) }
          }
          try { if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style)) } catch(e) {}
        })
      }

      let day = '', month = '', year = ''
      if (calf.birth_date) {
        const parts = calf.birth_date.split('-')
        if (parts.length === 3) { year = parts[0]; month = parts[1]; day = parts[2] }
      }

      const identity = calf.identity_number || calf.ear_tag || ''
      const r = ws.getRow(row)
      r.getCell('C').value = identity
      r.getCell('E').value = day
      r.getCell('F').value = month
      r.getCell('G').value = year
      r.getCell('I').value = calf.sex || ''
      r.getCell('K').value = calf.calf_details || 'Single'
      r.getCell('R').value = identity
      r.getCell('U').value = calf.father_id || ''
      r.getCell('X').value = calf.mother_id || ''
      if (calf.birth_mass) r.getCell('AH').value = parseFloat(calf.birth_mass)
      r.getCell('AJ').value = calf.color || ''
      r.commit()
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="birth_notification.xlsx"',
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error('Generate error:', err)
    return { statusCode: 500, body: 'Generation failed: ' + err.message }
  }
}

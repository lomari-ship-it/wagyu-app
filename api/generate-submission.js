import ExcelJS from 'exceljs'

export default async function handler(req, res) {
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
  const BREED = 'Full Blood Wagyu'

  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Wagyu Herd Management'
    const ROWS_PER_PAGE = 16
    const totalPages = Math.max(1, Math.ceil(calves.length / ROWS_PER_PAGE))

    for (let page = 0; page < totalPages; page++) {
      const pageCalves = calves.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)
      const sheetName = totalPages === 1 ? 'Submission' : 'Page ' + (page + 1)
      const ws = wb.addWorksheet(sheetName, {
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
      })
      ws.columns = [
        { width: 14 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 6 }, { width: 4 },
        { width: 16 }, { width: 12 }, { width: 14 }, { width: 4 }, { width: 16 }, { width: 12 }, { width: 14 }
      ]
      const border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }
      const hFill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFD9D9D9'} }
      const bFont = { bold:true, size:10 }
      const nFont = { size:10 }

      ws.mergeCells('A1:M1')
      Object.assign(ws.getCell('A1'), { value:'DNA PATERNITY TEST FORM', font:{bold:true,size:16}, alignment:{horizontal:'center',vertical:'middle'} })
      ws.getRow(1).height = 28
      ws.mergeCells('A2:M2')
      Object.assign(ws.getCell('A2'), { value:'NAMIBIA STUD BREEDERS ASSOCIATION', font:{bold:true,size:12}, alignment:{horizontal:'center'} })
      ws.getRow(2).height = 18
      ws.getRow(3).height = 6

      function slv(lc, lt, vc, vt) {
        const l = ws.getCell(lc); l.value=lt; l.font=bFont; l.fill=hFill; l.border=border; l.alignment={vertical:'middle'}
        const v = ws.getCell(vc); v.value=vt; v.font=nFont; v.border=border; v.alignment={vertical:'middle'}
      }

      ws.mergeCells('A4:B4'); ws.mergeCells('C4:F4'); ws.mergeCells('G4:I4'); ws.mergeCells('J4:M4')
      slv('A4','Owner / Eienaar:','C4',FARM_OWNER); slv('G4','Farm / Plaas Nommer:','J4',FARM_NUMBER); ws.getRow(4).height=18

      ws.mergeCells('A5:B5'); ws.mergeCells('C5:F5'); ws.mergeCells('G5:I5'); ws.mergeCells('J5:M5')
      slv('A5','Farm Name / Plaasnaam:','C5',FARM_NAME); slv('G5','Region / Streek:','J5',ADDRESS_REGION); ws.getRow(5).height=18

      ws.mergeCells('A6:B6'); ws.mergeCells('C6:F6'); ws.mergeCells('G6:I6'); ws.mergeCells('J6:M6')
      slv('A6','Tel:','C6',TEL); slv('G6','Country / Land:','J6',COUNTRY); ws.getRow(6).height=18

      ws.mergeCells('A7:B7'); ws.mergeCells('C7:F7'); ws.mergeCells('G7:I7'); ws.mergeCells('J7:M7')
      slv('A7','Email:','C7',EMAIL); slv('G7','Member No:','J7',MEMBER_NO); ws.getRow(7).height=18

      ws.mergeCells('A8:D8'); ws.mergeCells('E8:I8'); ws.mergeCells('J8:M8')
      slv('A8','Batch Ref:', 'E8', batchInfo.id ? String(batchInfo.id).substring(0,8) : '')
      slv('J8','Date:','J8', batchDate); ws.getRow(8).height=18

      const HR = 10
      ws.getRow(9).height = 4
      ws.getRow(HR).height = 30
      const hdrs = [['A','Breed
Ras'],['B','Calf Ear No.
Kalf Oor No.'],['C','Lab#'],['D','DOB
GD'],['E','Sex
Gesl.'],['F',''],
        ['G','Dam Ear No.
Moer Oor No.'],['H','Lab#'],['I','Reg#'],['J',''],['K','Sire Ear No.
Bul Oor No.'],['L','Lab#'],['M','Reg#']]
      for (const [col, text] of hdrs) {
        const cell = ws.getCell(col+HR)
        cell.value=text; cell.font=bFont; cell.fill=hFill; cell.border=border
        cell.alignment={horizontal:'center',vertical:'middle',wrapText:true}
      }

      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const calf = pageCalves[i]
        const rn = HR + 1 + i
        ws.getRow(rn).height = 16
        for (const col of ['A','B','C','D','E','F','G','H','I','J','K','L','M']) {
          const cell = ws.getCell(col+rn)
          cell.border=border; cell.font=nFont; cell.alignment={vertical:'middle'}
        }
        if (calf) {
          ws.getCell('A'+rn).value = calf.breed || BREED
          ws.getCell('B'+rn).value = calf.ear_tag || calf.identityNumber || calf.identity_number || ''
          ws.getCell('D'+rn).value = calf.birth_date ? fmtDOB(calf.birth_date) : (calf.birthDate ? fmtDOB(calf.birthDate) : '')
          ws.getCell('E'+rn).value = calf.sex || ''
          ws.getCell('G'+rn).value = calf.dam_id || calf.mother_id || ''
          ws.getCell('K'+rn).value = calf.sire_id || calf.father_id || ''
        }
      }

      const fr = HR + 1 + ROWS_PER_PAGE + 1
      ws.getRow(fr-1).height = 6
      ws.mergeCells('A'+fr+':F'+fr)
      ws.getCell('A'+fr).value = 'Signature / Handtekening: ___________________________'
      ws.getCell('A'+fr).font = nFont
      ws.mergeCells('G'+fr+':M'+fr)
      ws.getCell('G'+fr).value = 'Date / Datum: ' + batchDate
      ws.getCell('G'+fr).font = nFont
      ws.getRow(fr).height = 20
      ws.pageSetup.margins = {left:0.315,right:0.315,top:0.354,bottom:0.354,header:0.12,footer:0.12}
    }

    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="batch_submission_' + (batchInfo.id||'draft') + '.xlsx"')
    res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    console.error('Submission form error:', err)
    res.status(500).send('Generation failed: ' + err.message)
  }
}

function fmtDOB(d) {
  if (!d) return ''
  const p = d.split('-')
  return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0] : d
                    }

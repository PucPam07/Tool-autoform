import https from 'https';

const url = 'https://docs.google.com/forms/d/e/1FAIpQLSdTNrxpGiJXNzrTTqO8dVITSC6KS_xeT3g3RPynpHzzQN0Reg/viewform';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const s = data.indexOf('FB_PUBLIC_LOAD_DATA_');
    const a = data.indexOf('[', s);
    let depth = 0, inStr = false, esc = false, jsonStr = '';
    for (let i = a; i < data.length; i++) {
      const c = data[i];
      jsonStr += c;
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"' && !inStr) { inStr = true; continue; }
      if (c === '"' && inStr) { inStr = false; continue; }
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) break; }
    }
    const parsed = JSON.parse(jsonStr);
    const fields = parsed[1][1];
    
    // Show grid item (index 7, type=7)
    const gridItem = fields[7];
    console.log('=== GRID ITEM (index 7) ===');
    console.log('type:', gridItem[3]);
    console.log('title:', gridItem[1]);
    console.log('field[4] length:', gridItem[4] ? gridItem[4].length : 'null');
    console.log('');
    
    // Show each row in the grid
    if (gridItem[4]) {
      gridItem[4].forEach((row, i) => {
        console.log(`Row ${i}:`, JSON.stringify(row).substring(0, 200));
      });
    }

    console.log('\n=== SIMULATE WHAT SERVER PARSES FOR GRID ===');
    // Simulate the server parsing for type=7
    const rows = gridItem[4];
    const columns = rows[0][1] ? rows[0][1].map(c => c[0]) : [];
    console.log('Columns detected:', columns);
    rows.forEach((row, i) => {
      const rowId = row[0];
      const rowTitle = row[3] ? row[3][0] : '';
      console.log(`  Sub-row ${i}: id=${rowId}, title="${rowTitle}"`);
    });
    
    console.log('\n=== ALL ENTRY IDs THAT WILL BE SUBMITTED ===');
    // Simulate full parsing
    fields.forEach((f, i) => {
      if (!f || !f[4] || f[4].length === 0) return;
      const type = f[3];
      if (type === 7) {
        const rows2 = f[4];
        rows2.forEach((row, ri) => {
          const rowId = row[0];
          const rowTitle = row[3] ? row[3][0] : '';
          console.log(`[Grid row ${ri}] entry.${rowId} - "${rowTitle}"`);
        });
      } else {
        const qi = f[4][0];
        if (qi) console.log(`[item ${i} type${type}] entry.${qi[0]} - "${(f[1]||'').substring(0,40)}"`);
      }
    });
  });
});

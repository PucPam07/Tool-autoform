import https from 'https';
import { URLSearchParams } from 'url';

const postUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdTNrxpGiJXNzrTTqO8dVITSC6KS_xeT3g3RPynpHzzQN0Reg/formResponse';
const fbzx = '-7065436434681950021';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function post(params) {
  return new Promise((resolve) => {
    const body = new URLSearchParams(params).toString();
    const urlObj = new URL(postUrl);
    const req = https.request({
      hostname: urlObj.hostname, path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': UA
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.status || res.statusCode, body: d.substring(0, 100), location: res.headers.location }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.write(body);
    req.end();
  });
}

console.log('=== TEST A: Một POST duy nhất với TẤT CẢ câu trả lời + pageHistory=0,1,2 ===');
const r1 = await post({
  fvv: '1', draftResponse: '[]', pageHistory: '0,1,2', fbzx,
  'entry.1339646124': 'Tôi đồng ý',
  'entry.1792651302': 'Sinh viên (Thường sống ở khu trọ/ký túc xá quanh trường)',
  'entry.1803984375': 'Khoảng 3 - 5 lần/tuần (Đan xen giữa tự nấu và ăn ngoài)',
  'entry.542815768': 'Từ 20.000đ - 35.000đ / người',
  'entry.1534634948': '3 - Thỉnh thoảng',
  'entry.1999116860': '2 - Ít gặp',
  'entry.1403889638': '3 - Thỉnh thoảng',
  'entry.826869704': '4 - Thường gặp',
  'entry.1312498328': 'Có quan tâm',
  'entry.1866126486': 'Người bán tự giao hàng tận nơi trong bán kính gần quanh cửa hàng',
});
console.log('Kết quả:', r1.status, r1.location || '(no redirect)');
await new Promise(r => setTimeout(r, 3000));

console.log('\n=== TEST B: Submit tuần tự - Trang 0 trước ===');
const r2a = await post({
  fvv: '1', draftResponse: '[]', pageHistory: '0', fbzx,
  'entry.1339646124': 'Tôi đồng ý',
});
console.log('Trang 0:', r2a.status, r2a.location || '(no redirect)', 'body start:', r2a.body.substring(0, 50));
await new Promise(r => setTimeout(r, 1000));

console.log('=== TEST B: Submit tuần tự - Trang 1 (câu 1,2,3) ===');
const r2b = await post({
  fvv: '1', draftResponse: '[]', pageHistory: '0,1', fbzx,
  'entry.1792651302': 'Người đi làm trẻ tuổi (Bận rộn, độc thân hoặc sống với bạn bè)',
  'entry.1803984375': 'Hằng ngày (Tất cả các bữa ăn trong tuần)',
  'entry.542815768': 'Dưới 20.000đ / người',
});
console.log('Trang 1:', r2b.status, r2b.location || '(no redirect)');
await new Promise(r => setTimeout(r, 1000));

console.log('=== TEST B: Submit tuần tự - Trang 2 (grid + câu cuối) ===');
const r2c = await post({
  fvv: '1', draftResponse: '[]', pageHistory: '0,1,2', fbzx,
  'entry.1534634948': '4 - Thường gặp',
  'entry.1999116860': '5 - Rất thường gặp',
  'entry.1403889638': '2 - Ít gặp',
  'entry.826869704': '3 - Thỉnh thoảng',
  'entry.1312498328': 'Rất quan tâm và muốn trải nghiệm ngay',
  'entry.1866126486': 'Đặt trước trên ứng dụng – Tự ghé quầy lấy trên đường đi học/đi làm về (Tiết kiệm ship)',
});
console.log('Trang 2:', r2c.status, r2c.location || '(no redirect)');
console.log('\nNhìn vào Google Sheets để kiểm tra 2 submission mới nhất!');

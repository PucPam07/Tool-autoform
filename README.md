# Google Forms Auto-Filler Pro 🚀

[![Live Demo](https://img.shields.io/badge/🌐_Live_App-tool--autoform.vercel.app-007ACC?style=for-the-badge&logo=vercel&logoColor=white)](https://tool-autoform.vercel.app/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Vercel Status](https://img.shields.io/badge/Deployment-Online-brightgreen?style=for-the-badge&logo=vercel&logoColor=white)](https://tool-autoform.vercel.app/)

> 🌟 **Trải nghiệm trực tuyến ngay không cần cài đặt tại:** **[https://tool-autoform.vercel.app/](https://tool-autoform.vercel.app/)**

Công cụ tự động điền biểu mẫu Google Forms theo tỷ lệ câu trả lời cấu hình trước với giao diện Web Dashboard cao cấp (Glassmorphism & Dark Mode). 

Ứng dụng được viết hoàn toàn bằng **Node.js/Express** ở Backend (gửi POST request HTTP trực tiếp cực kỳ nhanh và nhẹ) và **Vanilla HTML/CSS/JS** ở Frontend kết hợp với **Chart.js** vẽ biểu đồ theo dõi thống kê thực tế theo thời gian thực.

---

## 🌐 Live Web Demo

Bạn có thể sử dụng ngay công cụ trực tiếp trên trình duyệt mà không cần cài đặt môi trường:

🔗 **Đường dẫn ứng dụng:** **[https://tool-autoform.vercel.app/](https://tool-autoform.vercel.app/)**

---

## ✨ Tính năng nổi bật

*   **Phân tích Form tự động**: Chỉ cần dán URL Google Form để tự động bóc tách cấu trúc câu hỏi, danh sách lựa chọn và các mã Entry ID tương ứng.
*   **Cấu hình tỷ lệ (%) linh hoạt**: 
    *   Kéo nút trượt (slider) hoặc nhập số trực tiếp để thiết lập tỷ lệ phân phối câu trả lời mong muốn.
    *   Nút **"Chia đều" (Auto-balance)** chia đều 100% cho toàn bộ phương án chỉ với 1 click.
    *   Hộp kiểm (checkboxes) hỗ trợ cài đặt xác suất tích chọn độc lập cho từng ô.
*   **Câu trả lời tự luận ngẫu nhiên**: Hỗ trợ nhập danh sách câu trả lời tùy biến (mỗi dòng một câu) để công cụ tự động lựa chọn ngẫu nhiên, hoặc tự động sinh tên Tiếng Việt/SĐT/Email nếu bỏ trống.
*   **Bảng tiến trình & Thống kê thời gian thực**:
    *   Hiển thị số lượng gửi Thành công / Thất bại / Còn lại cùng thanh tiến trình trực quan.
    *   Biểu đồ Chart.js so sánh song song **Mục tiêu (Cấu hình)** vs **Thực tế (Thành công)** cập nhật theo thời gian thực.
    *   Bảng nhật ký hoạt động (Live Logs) hiển thị chi tiết nội dung từng lượt gửi.
*   **Điều khiển thông minh**: Hỗ trợ Tạm dừng (Pause), Tiếp tục (Resume), Dừng hẳn (Stop) tiến trình bất cứ lúc nào.
*   **Hiệu năng vượt trội**: Gửi trực tiếp qua HTTP Client đa luồng (Multi-threads) với khoảng trễ (Delay) điều chỉnh được, không cần giả lập trình duyệt (Selenium/Puppeteer) giúp tiết kiệm 95% RAM/CPU và tốc độ cực kỳ nhanh.

---

## 🛠️ Hướng dẫn cài đặt và chạy trên máy Local

### 1. Yêu cầu hệ thống
Máy tính của bạn cần cài đặt sẵn **Node.js** (Khuyến nghị phiên bản v18 trở lên). Nếu chưa có, hãy tải và cài đặt từ trang chủ [Node.js](https://nodejs.org/).

### 2. Các bước cài đặt
Mở Terminal (Command Prompt hoặc PowerShell trên Windows, Terminal trên macOS/Linux) và chạy các lệnh sau:

1.  **Di chuyển vào thư mục dự án:**
    ```bash
    cd "đường_dẫn_đến_thư_mục_chứa_code"
    ```
2.  **Cài đặt các gói phụ trợ (Dependencies):**
    ```bash
    npm install
    ```
    *(Nếu trên PowerShell Windows bị chặn quyền chạy script của NPM, bạn có thể chạy lệnh: `npm.cmd install`)*

### 3. Khởi động công cụ
Chạy lệnh sau để khởi động máy chủ cục bộ:
```bash
node server.js
```
Hoặc dùng lệnh script npm:
```bash
npm start
```

Sau khi màn hình hiển thị `Server is running at http://localhost:3000`, hãy mở trình duyệt web và truy cập địa chỉ:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📖 Hướng dẫn sử dụng chi tiết

1.  **Nhập liên kết Form**: Dán URL Google Form công khai của bạn vào ô nhập liệu (hỗ trợ cả link dạng `/viewform` hoặc `/formResponse`) và nhấn **Phân tích Form**.
2.  **Cấu hình câu hỏi**:
    *   Đối với câu hỏi trắc nghiệm/thả xuống/thang đo: Kéo chỉnh tỷ lệ phần trăm cho từng đáp án sao cho tổng tỷ lệ bằng 100% (hoặc nhấn nút **Chia đều**).
    *   Đối với câu tự luận: Nhập các câu trả lời mẫu bạn muốn (mỗi dòng một câu) vào khung văn bản.
3.  **Cài đặt thông số gửi**:
    *   *Tổng số lượng*: Số lượt bạn muốn điền form.
    *   *Số luồng gửi đồng thời (Threads)*: Số luồng chạy cùng lúc (khuyến nghị từ 3 - 10 để tối ưu tốc độ và không bị Google chặn IP).
    *   *Độ trễ (Delay)*: Khoảng nghỉ giữa các lần gửi (tính bằng mili-giây, khuyến nghị từ 100ms - 500ms).
4.  **Bắt đầu**: Nhấn nút **Bắt đầu tự động gửi**. Giao diện sẽ chuyển sang Dashboard tiến trình, lúc này bạn có thể theo dõi biểu đồ kết quả thực tế tự động cập nhật và log chạy hiển thị liên tục bên dưới.

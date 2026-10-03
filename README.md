# Bóng Đá 3D

Game bóng đá arcade chạy bằng HTML, CSS và JavaScript thuần. `index.html` là entry point; `game.js` chọn nhánh WebGL 3D nếu trình duyệt hỗ trợ WebGL2, nếu không sẽ nạp Canvas 2D fallback. Three.js được vendored trong `vendor/`, không cần tải thư viện lúc chạy.

## Chạy cục bộ

Từ thư mục dự án, chạy một máy chủ tĩnh, ví dụ:

```sh
python3 -m http.server 8000
```

Mở `http://localhost:8000`. Thư mục `dist/` chứa bản static đã đồng bộ; dùng `dist/` làm thư mục publish cho Render Static Site.

## Điều khiển

- `W A S D` hoặc phím mũi tên: rê bóng; `A` / `D` khi sút để nhắm trái/phải. Cầu thủ đổi hướng mượt và bóng bám chân với độ trễ ngắn.
- `Shift`: tăng tốc.
- Giữ `Space` để lấy lực, thả để sút; trên điện thoại giữ nút **SÚT**.
- `Q` hoặc nút **KIỂU** trên điện thoại đổi giữa sút thường (mạnh), đặt lòng (chậm hơn, có độ xoáy) và lốp (bổng, hạ thấp hơn gần khung thành).
- `Esc` hoặc nút tạm dừng: tạm dừng/tiếp tục. Có thể đá lại từ đầu ở menu.
- Ghi 3 bàn trong 90 giây để thắng.

## Thủ môn học cục bộ

Thủ môn dùng Q-learning dạng nhỏ với 45 trạng thái rời rạc (vị trí sút, làn hướng bóng và 3 mức lực), 3 hành động (đổ trái/giữa/phải), exploration giảm dần và learning rate `0.28`. Policy chọn vị trí đón ban đầu; sau thời gian phản ứng, thủ môn ước lượng hướng, lực và độ xoáy từ chuyển động bóng đang quan sát, kèm nhiễu nên có thể đọc sai. Cản phá còn phụ thuộc thời điểm, khoảng với và xác suất — bóng có thể lọt lưới hoặc bật chệch sang bên. Hậu vệ cũng có thể chạm bóng và làm cú sút đổi hướng.

Bảng Q và số mẫu lưu trong `localStorage` của trình duyệt hiện tại dưới khóa `dem-san-co.goalkeeper-q.v1`; nút mũi tên cạnh chỉ báo sẽ xóa chúng. Dữ liệu không được gửi qua mạng. Bộ nhớ thuộc từng origin/trình duyệt nên một origin mới sẽ bắt đầu học từ đầu. Cú sút chệch/ra ngoài không được dùng làm reward.

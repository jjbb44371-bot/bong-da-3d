# Bóng Đá 3D

Game bóng đá arcade chạy bằng HTML, CSS và JavaScript thuần. `index.html` là entry point; `game.js` chọn nhánh WebGL 3D nếu trình duyệt hỗ trợ WebGL2, nếu không sẽ nạp Canvas 2D fallback. Three.js được vendored trong `vendor/`, không cần tải thư viện lúc chạy.

## Chạy cục bộ

Từ thư mục dự án, chạy một máy chủ tĩnh, ví dụ:

```sh
python3 -m http.server 8000
```

Mở `http://localhost:8000`. Thư mục `dist/` chứa bản static đã đồng bộ; dùng `dist/` làm thư mục publish cho Render Static Site.

## Điều khiển

- `W A S D` hoặc phím mũi tên: di chuyển; `A` / `D` khi sút để nhắm trái/phải.
- `Shift`: tăng tốc.
- Giữ `Space` để lấy lực, thả để sút; trên điện thoại giữ nút **SÚT**.
- `Esc` hoặc nút tạm dừng: tạm dừng/tiếp tục. Có thể đá lại từ đầu ở menu.
- Ghi 3 bàn trong 90 giây để thắng.

## Thủ môn học cục bộ

Thủ môn dùng Q-learning dạng nhỏ với 45 trạng thái rời rạc (vị trí sút, làn hướng bóng và 3 mức lực), 3 hành động (đổ trái/giữa/phải), exploration giảm dần và learning rate `0.28`. Pha cản phá thưởng `+1`; bàn thua thưởng `-1`. Policy đã chọn điều khiển vị trí di chuyển thật của thủ môn.

Bảng Q và số mẫu lưu trong `localStorage` của trình duyệt hiện tại dưới khóa `dem-san-co.goalkeeper-q.v1`; nút mũi tên cạnh chỉ báo sẽ xóa chúng. Dữ liệu không được gửi qua mạng. Bộ nhớ thuộc từng origin/trình duyệt nên một origin mới sẽ bắt đầu học từ đầu. Cú sút chệch/ra ngoài không được dùng làm reward.

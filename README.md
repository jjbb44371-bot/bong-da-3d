# Bóng Đá 3D

Game bóng đá arcade 11v11 chạy bằng HTML, CSS và JavaScript thuần. Mỗi đội có 10 cầu thủ sân và 1 thủ môn; người chơi điều khiển cầu thủ số 11, đồng đội và đối thủ chạy chỗ theo vai trò/đội hình. `index.html` là entry point; `game.js` chọn nhánh WebGL 3D nếu trình duyệt hỗ trợ WebGL2, nếu không sẽ nạp Canvas 2D fallback. Three.js được vendored trong `vendor/`, không cần tải thư viện lúc chạy.

Đây là thử thách ghi bàn arcade, không phải mô phỏng trọn vẹn: bạn điều khiển một cầu thủ, đồng đội tự hỗ trợ chạy chỗ vào khoảng trống, đồng thời tránh tập trung vào điểm hỗ trợ đã bị đồng đội chiếm; AI Đội Đỏ tổ chức phòng ngự. Hiện chưa có nút chuyền bóng, chuyển quyền sở hữu hay pha tấn công/tính bàn cho Đội Đỏ. Chỉ thủ môn Đội Đỏ giữ Q-learning; cầu thủ sân dùng heuristic đội hình/di chuyển do dự án tự viết, còn thủ môn Đội Xanh bám vị trí theo hướng bóng.

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
- Có thể dùng `Tab` để focus nút điều khiển cảm ứng rồi giữ `Enter` hoặc `Space`; `Enter` trên nút **SÚT** cũng thực hiện cú sút nhanh.
- `Q` hoặc nút **KIỂU** trên điện thoại đổi giữa sút thường (mạnh), đặt lòng (chậm hơn, có độ xoáy) và lốp (bổng, hạ thấp hơn gần khung thành).
- `Esc` hoặc nút tạm dừng: tạm dừng/tiếp tục. Có thể đá lại từ đầu ở menu.
- Ghi 3 bàn trong 90 giây để thắng. Trận có 11 cầu thủ mỗi đội; một hậu vệ gây áp lực, người kế tiếp bọc lót, số còn lại giữ khối đội hình. Đồng đội chạy vào khoảng trống theo vai trò/hướng bóng và tránh chọn lane đang bị đồng đội chiếm.

## Kiểm thử AI

Chạy `node --test tests/*.test.mjs` để kiểm tra roster/AI, vùng cầu môn, damping vật lý, và thông báo điểm số.

## Thủ môn học cục bộ

Thủ môn dùng Q-learning dạng nhỏ với 45 trạng thái rời rạc (vị trí sút, làn hướng bóng và 3 mức lực), 3 hành động (đổ trái/giữa/phải), exploration giảm dần và learning rate `0.28`. Policy chọn vị trí đón ban đầu; sau thời gian phản ứng, thủ môn ước lượng hướng, lực và độ xoáy từ chuyển động bóng đang quan sát, kèm nhiễu nên có thể đọc sai. Cản phá còn phụ thuộc thời điểm, khoảng với và xác suất — bóng có thể lọt lưới hoặc bật chệch sang bên. Hậu vệ cũng có thể chạm bóng và làm cú sút đổi hướng.

Bảng Q và số mẫu lưu trong `localStorage` của trình duyệt hiện tại dưới khóa `dem-san-co.goalkeeper-q.v1`; nút mũi tên cạnh chỉ báo sẽ xóa chúng. Dữ liệu không được gửi qua mạng. Bộ nhớ thuộc từng origin/trình duyệt nên một origin mới sẽ bắt đầu học từ đầu. Cú sút chệch/ra ngoài không được dùng làm reward.

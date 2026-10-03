# Backlog rà soát Bóng Đá 3D 11v11

**Cập nhật:** 2026-10-03 (Asia/Ho_Chi_Minh)  
**Repo:** `jjbb44371-bot/bong-da-3d`, nhánh `main`  
**Production:** [bong-da-3d.onrender.com](https://bong-da-3d.onrender.com/) — Render static service `srv-db07vefavr4c73ehdoqg`, workspace `tea-datk3l8u01pc739fp4u0`  
**Tình trạng trước lượt:** repo sạch tại `19a75a4` (`Add tactical 11v11 team AI`); Render báo deploy live cùng SHA đầy đủ `19a75a4e30879ab680ffea75c788d009f8ca9ba1`, build/deploy thành công. Không tìm thấy backlog/status/TODO nào có sẵn trong `/workspace`; đây là backlog được tạo sau khi kiểm tra.

## Tóm tắt audit

- Roster runtime báo **11 người mỗi đội, 10 cầu thủ sân mỗi bên, tổng 22**.
- Đã kiểm tra mô phỏng AI trong test unit và một vòng mô phỏng 60 giây với possession `home`/`neutral`/`away`.
- Playwright smoke test trên production trước thay đổi và bản dist thử nghiệm sau thay đổi: start, bàn phím W+Shift, sút giữ lực, đổi kiểu sút Q, pause/resume/restart; bản thử còn kiểm tra nút chạm ở viewport `390×844` và desktop `1280×720`.
- Không phát hiện lỗi JavaScript runtime trong smoke test. Các asset tĩnh chính trả `200` hoặc `304`; `/favicon.ico` trả `404`.
- Browser Playwright của phiên này **chặn WebGL2** (`AllowWebgl2:false`), do đó quan sát runtime đi qua Canvas 2D fallback; không được suy diễn đó là lỗi của người dùng hay xác nhận đã chạy nhánh WebGL.
- Repo dùng static build: Render `buildCommand` là `echo 'Static files are prebuilt in dist/'`, `publishPath=dist`; không có bundler/build script riêng được chạy.

## Công việc

### R-20261003-01 — Dừng render scene bị overlay che

- **Trạng thái:** `in_progress` — đã sửa và smoke-test trên bản dist thử; chờ production deploy và xác minh cuối.
- **Ưu tiên:** P1 / giá trị CPU-pin và pin điện thoại; confidence cao; effort thấp; rủi ro thấp-vừa.
- **Phạm vi:** vòng lặp Canvas và WebGL khi intro, pause, hoặc kết quả trận đang phủ scene.
- **Vấn đề / bằng chứng:** trước sửa, `game-canvas.js` gọi `render(now)` ở mọi frame dù `game.active=false`; `game-webgl.js` luôn gọi `renderer.render(scene,camera)`. Browser Playwright cho khoảng 23–25 render/giây sau menu và 12.6 render/giây khi pause trong một lần đo; pause overlay làm scene phía sau không còn hữu ích nhưng vẫn vẽ.
- **Nguyên nhân:** lệnh render không được điều kiện theo trạng thái trận; chỉ physics/update đã dừng.
- **Đã làm:** Canvas chỉ render khi trận còn active (toast vẫn được cập nhật); WebGL chỉ gọi renderer khi trận active, nhưng giữ cập nhật camera để không đổi vòng đời camera. Một lần render cuối bị bỏ khi `update` kết thúc trận.
- **Phương án đã thử:** profile từng pass render; chỉ cache cảnh tĩnh không giải quyết render thừa khi overlay phủ; thêm state gate là cách ít rủi ro và không đổi UI.
- **Kiểm chứng bản thử:** idle Canvas 1.2 giây có **0 frame render**; pause 1.2 giây giữ nguyên clock và draw counter; resume render trở lại (29 frame/0.7 giây ở lần đo). Keyboard/touch, shot, đổi mode, pause/resume/restart đều tiếp tục hoạt động.
- **Tests:** `node --test tests/match-ai.test.mjs` 5/5 pass; syntax check source/dist pass; desktop `1280×720` và mobile `390×844` Playwright smoke pass.
- **Regression/rủi ro:** Canvas path chạy thật; WebGL2 bị môi trường browser chặn nên chỉ kiểm tra source/syntax của nhánh đó. Thay đổi WebGL chỉ bọc `renderer.render` bằng `if(game.active)`, không đổi camera, input, physics, hoặc scene graph.
- **Bước tiếp:** commit/push `main`, xác nhận auto-deploy, kiểm tra production; xác nhận scene không chạy dưới overlay và resume/start render bình thường. Sau đó chuyển sang `completed` nếu đạt.

### R-20261003-02 — Giảm chi phí lặp của Canvas fallback khi đang chơi

- **Trạng thái:** `in_progress` — thay đổi đã triển khai, qua test và so sánh ảnh bản thử; cần production verification.
- **Ưu tiên:** P2 / confidence trung bình-cao / effort thấp / rủi ro thấp-vừa.
- **Phạm vi:** Canvas 2D fallback, không nhằm đổi bố cục hoặc chủ đề hình ảnh.
- **Vấn đề / bằng chứng:** profile tạm thời trên viewport desktop cho thấy pass nền khoảng `7.55 ms/frame`; khán giả và cỏ cũng tạo nhiều object chiếu cảnh trong các hot loop. Phần sau chỉ là đo trong browser hiện tại, không phải benchmark thiết bị người dùng.
- **Nguyên nhân:** gradient, sao và vignette không đổi vẫn được tái tạo; các projection loop cấp phát object tạm; danh sách actor bị dựng mới mỗi frame.
- **Đã làm:** cache backdrop sao/gradient và vignette; tạo sprite khán giả dùng lại; tái sử dụng actor list và buffer output của phép chiếu cho loop khán giả/cỏ. Công thức camera/hình học và thông số UI không đổi.
- **Phương án đã thử/kết quả:** cache backdrop làm pass nền đo được giảm khoảng `7.55 → 2.96 ms/frame` trong profile instrumented; FPS tổng dao động và không đủ cơ sở để tuyên bố cải thiện tổng thể từ số đo này. Gameplay screenshot bản thử được so trực tiếp với production cũ và không thấy sai lệch bố cục/hình ảnh đáng kể.
- **Tests:** `node --test tests/match-ai.test.mjs` 5/5 pass; `node --check` toàn bộ JS source và JS dist pass; `cmp` source/dist cho `game-canvas.js` và `game-webgl.js` khớp; Playwright start/shot/pause/resume/restart + desktop/mobile pass.
- **Regression/rủi ro:** Canvas sprite/raster cache có thể có sai khác khử răng cưa trên DPR cao; test viewport browser hiện tại `dpr=1`. Chưa đo bộ nhớ hay frame-time trên điện thoại vật lý.
- **Bước tiếp:** production smoke trên trình duyệt thực tế; nếu có report chất lượng hình ảnh/DPR hoặc FPS từ máy người dùng, profiling lại trước khi hạ chất lượng asset.

### R-20261003-03 — Xác minh nhánh WebGL2 trên trình duyệt có GPU

- **Trạng thái:** `blocked` cho kiểm thử thực thi ở môi trường hiện tại; source đã syntax-check; giữ trong backlog.
- **Ưu tiên:** P2 / impact vừa / confidence cao về giới hạn môi trường, chưa có bằng chứng lỗi sản phẩm.
- **Phạm vi:** renderer WebGL2, camera, render-loop gate khi active.
- **Bằng chứng:** Playwright console ghi `Failed to create WebGL context: ... AllowWebgl2:false restricts context creation on this system`; game tự chuyển sang Canvas 2D, vì vậy không thể kết luận nhánh WebGL đã chạy.
- **Đã thử:** production và local preview đều báo cùng giới hạn; Canvas fallback hoạt động; `node --check game-webgl.js` và dist pass. Không thay đổi browser flags/hạ tầng của người dùng.
- **Phần còn thiếu:** xác minh visual và start/pause/resume/restart trên WebGL2 thật.
- **Rủi ro:** low-to-medium; thay đổi WebGL là state gate đơn giản nhưng chưa được quan sát runtime.
- **Dependency / bước tiếp:** cần browser/thiết bị có WebGL2 được cho phép. Khi có điều kiện, chạy desktop WebGL smoke và kiểm tra pause giữ frame, resume render lại.

### R-20261003-04 — `/favicon.ico` trả 404

- **Trạng thái:** `deferred` (non-blocking).
- **Impact/severity:** thấp; chỉ favicon/tab chrome, không ảnh hưởng gameplay, input, asset sân, hoặc build.
- **Bằng chứng:** request `/favicon.ico` trả 404 trong Playwright; stylesheet, ảnh sân và module JS chính không lỗi.
- **Nguyên nhân:** chưa thấy favicon route/file được publish.
- **Đã làm:** chưa sửa vì không phải lỗi gameplay và không tạo thay đổi hình thức chỉ để có diff.
- **Rủi ro:** biểu tượng tab/shortcut có thể không hiện.
- **Bước tiếp:** chỉ thêm favicon nếu được ưu tiên riêng cùng tài sản thương hiệu; không cản phát hành đợt này.

## Phạm vi đã kiểm tra / giới hạn bằng chứng

- **Roster:** metadata runtime 11v11; unit test xác nhận 10 role sân mỗi đội, đúng đối xứng và hai nửa sân.
- **AI/gameplay:** unit test hiện có + test mới 60 giây mô phỏng; smoke input và một cú sút hợp lệ. Chưa chạy hết trận 90 giây hoặc tự động đạt 3 bàn trong browser.
- **Input:** keyboard W/Shift/Space/Q/Escape, touch D-pad/shoot, pause/resume/restart đã được thao tác thực tế.
- **Mobile/layout:** `390×844`, `documentElement.scrollWidth=390`, touch panel nằm trong viewport; không thấy horizontal overflow.
- **Desktop/layout:** `1280×720`, `scrollWidth=1280`; không thấy horizontal overflow.
- **Network:** game tĩnh, không phát hiện gameplay API/network session; requests chính `200/304`. Favicon 404 được ghi riêng.
- **Logs/deploy trước sửa:** Render deploy `dep-db0akhs9v7es73akcd20` live, build và deploy ended thành công; không clear cache. Auto deploy đang bật (`branch=main`, trigger `commit`).
- **Nguồn đã mở/đối chiếu:** [Production game](https://bong-da-3d.onrender.com/), [GitHub repository](https://github.com/jjbb44371-bot/bong-da-3d), Render service URL từ connector: `https://dashboard.render.com/static/srv-db07vefavr4c73ehdoqg`.

## Cập nhật sau deploy

Điền commit/deploy ID, events, HTTP/asset check, desktop/mobile smoke, console/network và kết quả rollback nếu phát hiện lỗi. Chỉ chuyển các mục `in_progress` sang `completed` sau khi xác minh production thực tế.

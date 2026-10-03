# Backlog rà soát Bóng Đá 3D 11v11

**Cập nhật:** 2026-10-03 (Asia/Ho_Chi_Minh), lượt audit tiếp theo — kiểm thử dist local xong, chờ phát hành
**Repo:** `jjbb44371-bot/bong-da-3d`, nhánh `main`
**Production:** [bong-da-3d.onrender.com](https://bong-da-3d.onrender.com/) — Render static service `srv-db07vefavr4c73ehdoqg`, workspace `tea-datk3l8u01pc739fp4u0`
**Tình trạng trước lượt:** repo ở `f0e1bea` (`Record production audit verification`); production đang chạy commit `512a1954f0dbf2f73af2a07259b110b9b78c5ba0`, deploy `dep-db0cqqc9v7es73ass900` live. Service được xác minh đúng repo, branch `main`, `autoDeploy=yes`, publish `dist`; không clear cache.

## Tóm tắt audit

- Runtime báo **11 người mỗi đội, 10 cầu thủ sân mỗi bên + 1 thủ môn, tổng 22**; kiểm tra trên Canvas 2D.
- Unit suite hiện có **13/13 pass**, gồm AI 60 giây/đổi possession, chạy chỗ né lane đông, goal aperture, damping theo dt, accessible score announcement, RAF/input/layout contracts. Source và `dist` qua cú pháp và byte-parity.
- Desktop đã thao tác WASD, Shift, Space, Q, Escape, resume, restart; mobile `390×844` và landscape thấp `667×360` thử D-pad/sprint/shoot/shot mode/pause/resume/restart, Enter/Space trên các touch controls, không tràn ngang và mọi nút nằm trong viewport.
- Đo Canvas loop: trước sửa pause 524 callback/2s; sau sửa **0 callback trong 2s paused** sau khi toast hết, đồng hồ đứng; resume khởi động lại khoảng 234 callback/2s trong lần đo và restart tiếp tục.
- Local browser console **0 errors**; một warning WebGL2 do Playwright báo `AllowWebgl2:false`. Chỉ chạy Canvas fallback runtime; WebGL đã syntax/unit/source-check, không khẳng định đã chạy runtime.
- Nguồn chính thức EA FC 27 mô tả AI phản ứng với khoảng trống và tránh khu vực đông; algorithm không công bố. Heuristic né lane của game là thiết kế độc lập, không suy đoán thuật toán proprietary.
- Không thêm analytics/tài khoản/thu thập dữ liệu/chi phí. Render dùng static `dist`; chưa phát hành lượt này.

## Backlog và kết quả

### R-20261003-01 — Dừng render scene bị overlay che

- **Trạng thái:** `completed` — production live và runtime gate đã được đo.
- **Ưu tiên:** P1; confidence cao; effort thấp; rủi ro thấp-vừa.
- **Phạm vi/nguyên nhân:** Canvas luôn gọi `render(now)` kể cả lúc `game.active=false`; WebGL luôn gọi `renderer.render(scene,camera)`. Vì intro/pause/result che scene, CPU/GPU vẫn vẽ phần không hữu ích. Browser profile trước sửa ghi khoảng 23–25 render/s sau menu và 12.6 render/s khi pause ở một lần đo.
- **Đã sửa:** Canvas render chỉ khi trận active, vẫn cập nhật toast; WebGL chỉ render khi active nhưng giữ cập nhật camera; không render thêm frame sau khi trận kết thúc trong `update`.
- **Phương án/test:** profile các pass; cache scene tĩnh riêng không dừng render thừa nên bổ sung gate theo state. Local và production đều có 0 Canvas ops ở idle sau 1.1–1.2 giây; pause 1.1–1.2 giây giữ nguyên clock và draw counter; resume làm draw counter tăng trở lại. Desktop và mobile start/shot/pause/resume/restart đều đạt.
- **Production evidence:** sau deploy `dep-db0cqqc9v7es73ass900`, root HTTP `200`; `game-canvas.js` và `game-webgl.js` trên production khớp byte với `dist`; browser production đo `idleCanvasOps=0`, pause `canvasOpsBefore=336364`, `canvasOpsAfter=336364`, resume tăng thêm `102690` ops trong 0.6 giây.
- **Giới hạn/rủi ro:** WebGL2 runtime chưa quan sát được vì browser báo `AllowWebgl2:false`; phần WebGL chỉ được syntax-check và review source. Thay đổi chỉ bọc lệnh renderer bằng `if(game.active)`, không đổi physics, input, camera hay scene graph.

### R-20261003-02 — Giảm chi phí lặp của Canvas fallback khi đang chơi

- **Trạng thái:** `completed` cho tối ưu đã triển khai; benchmark thiết bị vật lý vẫn là hạng mục follow-up, không phải release blocker.
- **Ưu tiên:** P2; confidence trung bình-cao; effort thấp; rủi ro thấp-vừa.
- **Nguyên nhân:** gradient/sao/vignette bất biến được tái tạo mỗi frame; projection loops tạo object tạm; danh sách actor bị dựng lại liên tục.
- **Đã sửa:** cache backdrop và vignette; sprite khán giả dùng lại; reuse actor list và buffer cho projection crowd/grass. Giữ camera/hình học và UI.
- **Phương án/kết quả:** profiling instrumented ghi pass nền giảm khoảng `7.55 → 2.96 ms/frame`; FPS tổng dao động, nên không khẳng định tăng FPS tổng. Gameplay screenshot local và production so với production trước sửa không cho thấy sai khác bố cục/hình ảnh đáng kể.
- **Kiểm chứng:** 5/5 unit tests; toàn bộ JS source/dist syntax-check; source/dist khớp; production desktop `1280×720` và mobile `390×844` smoke pass; mobile `scrollWidth=390`, touch panel trong viewport.
- **Giới hạn/rủi ro:** DPR=1 trong browser test; chưa đo bộ nhớ/frame-time trên điện thoại vật lý. Nếu có báo cáo chất lượng ảnh/DPR hoặc FPS thực tế, profile lại trước khi giảm chất lượng asset.

### R-20261003-03 — Xác minh nhánh WebGL2 trên trình duyệt có GPU

- **Trạng thái:** `blocked` cho runtime test trong môi trường hiện tại; chưa có bằng chứng lỗi sản phẩm.
- **Ưu tiên:** P2; impact vừa; confidence cao về giới hạn môi trường.
- **Bằng chứng:** Playwright ghi `Failed to create WebGL context: ... AllowWebgl2:false restricts context creation on this system`; production tự fallback Canvas 2D.
- **Đã thử:** production và local preview; WebGL JS và dist qua `node --check`; Canvas fallback chạy gameplay/pause/resume. Không đổi browser flags hay hạ tầng máy người dùng.
- **Còn thiếu/rủi ro:** xác minh hình ảnh và start/pause/resume/restart trên WebGL2 thật; lượt hiện tại còn thay đổi input cancellation, luật goal/damping và scheduler RAF trong `game-webgl.js`. Các phần này mới qua syntax/unit/static contract tests, chưa được thực thi bằng WebGL2 runtime.
- **Bước tiếp:** khi có browser/thiết bị bật WebGL2, chạy smoke desktop, xác nhận pause giữ frame và resume render lại.

### R-20261003-04 — `/favicon.ico` trả 404

- **Trạng thái:** `deferred`, non-blocking; severity thấp.
- **Bằng chứng/nguyên nhân:** request favicon trả 404 trong lần audit trước; không ảnh hưởng gameplay hay asset chính.
- **Đã làm/rủi ro:** chưa thêm favicon vì không phải lỗi gameplay và không tạo thay đổi hình thức chỉ để có diff; biểu tượng tab/shortcut có thể không hiện.
- **Bước tiếp:** chỉ thêm khi được ưu tiên riêng cùng tài sản thương hiệu.

### R-20261003-05 — Đồng đội chạy vào lane đã bị chiếm

- **Trạng thái:** `completed` — heuristic đã sửa và unit test có regression case.
- **Ưu tiên:** P2; confidence cao; effort thấp; rủi ro thấp.
- **Nguồn/giới hạn:** EA FC 27 công bố AI tấn công phản ứng với khoảng trống và tránh khu vực đông; họ không công bố thuật toán. Tính điểm occupancy bên dưới là suy luận thiết kế mới cho game này, không phải thuật toán EA.
- **Đã sửa:** candidate support-run bị tăng penalty theo mật độ/độ gần đồng đội trong cùng lane; vẫn giữ hướng chạy, vai trò, 11v11 và defensive shape.
- **Kiểm chứng:** test xác nhận người chạy chọn lane ít bị chiếm hơn; unit suite chạy qua.

### R-20261003-06 — Bóng chạm cột/xà vẫn có thể được tính bàn

- **Trạng thái:** `completed` — luật dùng chung cho Canvas/WebGL và regression tests.
- **Ưu tiên:** P2; confidence cao; effort thấp; rủi ro thấp.
- **Nguyên nhân:** điều kiện ghi bàn cũ chỉ xét vị trí tâm bóng, không trừ bán kính bóng/cột và độ cao xà.
- **Đã sửa:** vùng ghi bàn yêu cầu toàn bộ bóng lọt qua khẩu độ trong hình học sân hiện có; không đổi kích thước khung thành hay vị trí sân.
- **Kiểm chứng:** case giữa khung thành được nhận; tâm sát/vượt mép cột hoặc xà bị loại; test damping xác nhận tương đương tại 30/60 Hz; hai renderer gọi chung luật.

### R-20261003-07 — `pointercancel`/mất focus có thể biến charge thành cú sút

- **Trạng thái:** `completed` — cancel chỉ hủy charge; pointerup chủ động mới phát bóng.
- **Ưu tiên:** P2; confidence cao; effort thấp; rủi ro thấp.
- **Nguyên nhân:** pointercancel và lostpointercapture dùng cùng handler với pointerup; blur lại gọi fireShot.
- **Đã sửa:** tách release/cancel cho Canvas và WebGL; blur dọn held/pressed state, hủy charge; touch buttons cũng nhận Enter/Space mà không để Space truyền thành phím sút toàn cục.
- **Kiểm chứng:** browser dispatch pointercancel/blur không đổi toast thành feedback sút, power meter tắt; pointerup/Space/Enter phát cú sút bình thường.

### R-20261003-08 — Intro/overlay bị cắt ở mobile landscape thấp

- **Trạng thái:** `completed` — overlay cuộn được, shell khớp chiều cao viewport thấp.
- **Ưu tiên:** P2; confidence cao; effort thấp; rủi ro thấp.
- **Nguyên nhân:** shell giữ `min-height:540px` trong viewport cao 360px, làm phần intro nằm ngoài màn hình.
- **Đã sửa:** breakpoint mobile thấp dùng `100dvh`, overlay `overflow-y:auto`; ẩn credit ảnh không thiết yếu ở cảnh này.
- **Kiểm chứng:** intro scrollHeight vượt clientHeight nhưng cuộn được; vào sân thành công ở `667×360`; touch controls, pause và shot mode đều nằm trong viewport; `scrollWidth=667`. Portrait `390×844` không regression.

### R-20261003-09 — Thông báo bàn thắng chưa đọc rõ tỉ số cho screen reader

- **Trạng thái:** `completed` — thông báo live-region nêu tỉ số và số bàn còn lại.
- **Ưu tiên:** P2; confidence cao; effort thấp; rủi ro thấp.
- **Đã sửa:** formatter thuần dùng chung tạo câu announce sau khi ghi bàn; vùng `aria-live=polite`/`aria-atomic=true` có sẵn tiếp nhận thông báo; toast thị giác giữ nguyên.
- **Kiểm chứng:** unit test nội dung ở mốc 1 và 3 bàn, static integration guard cho cả hai renderer và live region.

### R-20261003-10 — RAF tiếp tục đánh thức CPU trong pause/intro

- **Trạng thái:** `completed` cho Canvas, WebGL source đã đổi nhưng runtime vẫn cần thiết bị có WebGL2.
- **Ưu tiên:** P2; confidence cao về wakeup dư thừa, effort thấp; rủi ro vừa do vòng đời resume.
- **Bằng chứng trước sửa:** khi pause Canvas, browser ghi 524 callback/2s dù clock/scene không đổi.
- **Đã sửa:** scheduler chỉ lập frame kế tiếp khi trận đang chạy hoặc toast cần hết thời gian; resume/restart khởi động lại; renderer/camera chỉ cập nhật lúc active. Không thay đổi simulation timestep hay logic 11v11.
- **Kiểm chứng:** local Canvas có 0 callback mới trong 2s pause sau khi toast hết; khoảng 234/2s khi active, resume làm clock tiếp tục, restart hoạt động. WebGL chỉ qua syntax/static tests do môi trường không cấp WebGL2.

## Phạm vi đã kiểm tra / giới hạn bằng chứng

- **Roster/AI:** metadata runtime 11v11; unit test xác nhận 10 role sân mỗi đội, hai thủ môn trong roster/render source, đúng đối xứng và hai nửa sân; mô phỏng 60 giây AI với possession luân phiên.
- **Gameplay/input:** keyboard W/Shift/Space/Q/Escape, pointer D-pad/sprint/shoot/shot mode, pointercancel/blur, pause/resume/restart đã được thao tác; touch buttons cũng thử keyboard activation. Chưa chạy hết trận 90 giây hoặc tự động đạt 3 bàn trong browser.
- **Desktop/mobile:** `1280×720`, `390×844`, `667×360`; không horizontal overflow; landscape controls trong viewport.
- **Network/build:** static resources chính `200/304`; Render echo build succeeded; không có backend gameplay session/API được phát hiện; favicon 404 được ghi ở mục riêng.
- **Console:** local dist cuối 0 errors, một warning do môi trường không cấp WebGL2. Không diễn giải warning này thành lỗi người dùng.
- **Nguồn đã mở/đối chiếu:** [EA FC 27 gameplay deep dive](https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-gameplay-deep-dive), [production game](https://bong-da-3d.onrender.com/), [GitHub repository](https://github.com/jjbb44371-bot/bong-da-3d), [Render service](https://dashboard.render.com/static/srv-db07vefavr4c73ehdoqg).

## Hồ sơ release production

- **Từ trạng thái trước:** deploy live `dep-db0akhs9v7es73akcd20`, commit `19a75a4e30879ab680ffea75c788d009f8ca9ba1`.
- **Commit mới:** `512a1954f0dbf2f73af2a07259b110b9b78c5ba0` — `Avoid rendering hidden match scenes`; đã push lên `main`.
- **Auto-deploy:** service cấu hình `autoDeploy=yes`, branch `main`, trigger `commit`; đã kiểm tra event sau push nhưng không có deploy mới, nên trigger đúng service qua Render API. Không clear cache.
- **Deploy/build:** deploy `dep-db0cqqc9v7es73ass900` live; build `bld-db0cqqc9v7es73ass90g` succeeded; `build_ended` event `evt-db0cqs9mgk9c73ciajqg` và `deploy_ended` event `evt-db0cqsijtthc73f3680g` đều success. Trigger `clearCache=false`. Không rollback.
- **Production HTTP/assets:** HTTP `200`; `last-modified=2026-10-03 09:40:02 UTC`; `index.html`, `game-canvas.js`, `game-webgl.js` đều HTTP `200` và khớp byte với `dist` của commit.
- **Production browser smoke:** 11v11/22 players; idle Canvas ops `0`; shot desktop `DỨT ĐIỂM!`; Q đổi mode; pause không đổi clock/draw count; resume render lại; restart trả `01:30` và score `0`; mobile touch shot `ĐẶT LÒNG XOÁY!`, pause/resume đạt.
- **Transient HTTP:** một GET bị peer ngắt (curl 56) trong lúc kiểm tra; lần chẩn đoán kế tiếp qua HTTP/1.1 và các asset checks trả 200, byte khớp. Không còn lỗi production quan sát được.

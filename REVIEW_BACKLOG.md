# Backlog rà soát Bóng Đá 3D 11v11

**Cập nhật:** 2026-10-03 (Asia/Ho_Chi_Minh), sau production verification
**Repo:** `jjbb44371-bot/bong-da-3d`, nhánh `main`
**Production:** [bong-da-3d.onrender.com](https://bong-da-3d.onrender.com/) — Render static service `srv-db07vefavr4c73ehdoqg`, workspace `tea-datk3l8u01pc739fp4u0`
**Tình trạng trước lượt:** repo sạch tại `19a75a4` (`Add tactical 11v11 team AI`); Render deploy live cùng SHA đầy đủ `19a75a4e30879ab680ffea75c788d009f8ca9ba1`, build/deploy thành công. Không tìm thấy backlog/status/TODO có sẵn trong `/workspace`; tệp này được tạo sau khi kiểm tra. **Trạng thái cuối:** code đã lên `main` ở `512a1954f0dbf2f73af2a07259b110b9b78c5ba0` và production deploy `dep-db0cqqc9v7es73ass900` ở trạng thái live.

## Tóm tắt audit

- Runtime báo **11 người mỗi đội, 10 cầu thủ sân mỗi bên, tổng 22**.
- Unit test và mô phỏng 60 giây đã kiểm tra AI, đối xứng roster và possession `home`/`neutral`/`away`.
- Đã thao tác start, W+Shift, sút giữ lực, Q đổi kiểu sút, pause/resume/restart ở desktop; đã thử D-pad/sút/pause/resume bằng pointer trên viewport mobile.
- Production sau deploy: console **0 lỗi**, 1 cảnh báo WebGL2 bị môi trường Playwright chặn; game chạy Canvas 2D fallback. Các asset chính trả `200/304`; HTML, Canvas JS và WebGL JS tải trực tiếp từ production khớp byte với `dist` của commit.
- Không tuyên bố đã thực thi nhánh WebGL2 hoặc hoàn tất trọn trận 90 giây; hai việc này chưa được chạy.
- Render dùng static build: `buildCommand=echo 'Static files are prebuilt in dist/'`, `publishPath=dist`; build event của release đã thành công. Không clear cache.

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
- **Còn thiếu/rủi ro:** xác minh hình ảnh và start/pause/resume/restart trên WebGL2 thật; thay đổi WebGL là state gate nhỏ nhưng chưa chạy runtime.
- **Bước tiếp:** khi có browser/thiết bị bật WebGL2, chạy smoke desktop, xác nhận pause giữ frame và resume render lại.

### R-20261003-04 — `/favicon.ico` trả 404

- **Trạng thái:** `deferred`, non-blocking; severity thấp.
- **Bằng chứng/nguyên nhân:** request favicon trả 404 trong lần audit trước; không ảnh hưởng gameplay hay asset chính.
- **Đã làm/rủi ro:** chưa thêm favicon vì không phải lỗi gameplay và không tạo thay đổi hình thức chỉ để có diff; biểu tượng tab/shortcut có thể không hiện.
- **Bước tiếp:** chỉ thêm khi được ưu tiên riêng cùng tài sản thương hiệu.

## Phạm vi đã kiểm tra / giới hạn bằng chứng

- **Roster/AI:** metadata runtime 11v11; unit test xác nhận 10 role sân mỗi đội, đúng đối xứng và hai nửa sân; thêm test 60 giây AI với possession luân phiên.
- **Gameplay/input:** keyboard W/Shift/Space/Q/Escape, pointer D-pad/shoot, shot mode, pause/resume/restart đã được thao tác thực tế. Chưa chạy hết trận 90 giây hoặc tự động đạt 3 bàn trong browser.
- **Desktop/mobile:** `1280×720` và `390×844`, không horizontal overflow; touch panel có bounds `x=15,y=711,w=360,h=116` trên mobile.
- **Network/build:** static resources chính `200/304`; Render echo build succeeded; không có backend gameplay session/API được phát hiện; favicon 404 được ghi ở mục riêng.
- **Console:** production sau deploy 0 errors, một warning do môi trường không cấp WebGL2. Không diễn giải warning này thành lỗi người dùng.
- **Nguồn đã mở/đối chiếu:** [Production game](https://bong-da-3d.onrender.com/), [GitHub repository](https://github.com/jjbb44371-bot/bong-da-3d), [Render service](https://dashboard.render.com/static/srv-db07vefavr4c73ehdoqg).

## Hồ sơ release production

- **Từ trạng thái trước:** deploy live `dep-db0akhs9v7es73akcd20`, commit `19a75a4e30879ab680ffea75c788d009f8ca9ba1`.
- **Commit mới:** `512a1954f0dbf2f73af2a07259b110b9b78c5ba0` — `Avoid rendering hidden match scenes`; đã push lên `main`.
- **Auto-deploy:** service cấu hình `autoDeploy=yes`, branch `main`, trigger `commit`; đã kiểm tra event sau push nhưng không có deploy mới, nên trigger đúng service qua Render API. Không clear cache.
- **Deploy/build:** deploy `dep-db0cqqc9v7es73ass900` live; build `bld-db0cqqc9v7es73ass90g` succeeded; `build_ended` event `evt-db0cqs9mgk9c73ciajqg` và `deploy_ended` event `evt-db0cqsijtthc73f3680g` đều success. Trigger `clearCache=false`. Không rollback.
- **Production HTTP/assets:** HTTP `200`; `last-modified=2026-10-03 09:40:02 UTC`; `index.html`, `game-canvas.js`, `game-webgl.js` đều HTTP `200` và khớp byte với `dist` của commit.
- **Production browser smoke:** 11v11/22 players; idle Canvas ops `0`; shot desktop `DỨT ĐIỂM!`; Q đổi mode; pause không đổi clock/draw count; resume render lại; restart trả `01:30` và score `0`; mobile touch shot `ĐẶT LÒNG XOÁY!`, pause/resume đạt.
- **Transient HTTP:** một GET bị peer ngắt (curl 56) trong lúc kiểm tra; lần chẩn đoán kế tiếp qua HTTP/1.1 và các asset checks trả 200, byte khớp. Không còn lỗi production quan sát được.

# Automatic Pi bulk scanning

Open `/scan?camera=pi` in current Chrome, sign in, connect the Pi by USB, and select **Connect Pi camera**. Allow Chrome's local-network permission. The preview, scan-area selection, calibration, capture, recognition, review and queue all run inside the live app. No local camera page or separate popup is used.

Fit the scan outline to the card position by clicking opposite corners in the preview. Clear the stand and select **Stand is empty — start automatic scanning**. A settled card triggers identification. Strong separated matches enter the ready queue automatically; uncertain matches stay in Review later without pausing the next card. Resolve them after Finish scanning. Remove the card completely before placing the next one. Identical physical copies can then be scanned separately.

The scanner shows Captured this run, Identified this run, Ready to save and Review later counters, plus failures needing retry. Capture totals count unique photos sent to recognition; polling frames and retrying the same photo do not add cards. Ready/review totals include any previously retained cards. The latest run totals persist alongside finished results. A card swapped between camera snapshots cannot be counted: hold it until Captured increases, then remove it and wait for Ready for next card.

**Finish scanning** always opens a results dialog, including when nothing was queued. It lists ready cards and unconfirmed identifications and includes a destination binder selector. Use **Review match** to resolve uncertain cards, **Ignore this capture** to discard a suspect identification, **Add next** for variant/condition review, or **Add all** to save ready cards. A save confirmation names the destination binder. Both ready cards and unconfirmed identifications persist in the browser. The finish URL reopens results after a refresh.

An empty-stand background comparison checks the changed object's boundaries and portrait proportions before allowing automatic queueing. Suspected photo-edge cutoffs, scan-area cutoffs and incomplete shapes go to review, even with a strong match. This is a conservative framing heuristic, not a guarantee that every partial card will be detected.

Detection uses serial full-resolution captures from the existing service, so each placement takes several seconds (about 3.3 seconds per photo in the measured Pi setup). Two consistent photos trigger recognition. Keep each card in place until the ready/review count increases, then remove it and wait for Ready before placing the next card. Moving the camera or changing the area requires empty-stand recalibration. Stop cancels capture and prevents late inference from starting a new queue operation. Finish waits for a current identification before opening results; a final present-but-unsettled capture is sent to review. Failed matching preserves the photo for manual retry and carries the error into finished results.

Presence and stability comparison removes RGB offsets separately for each image row to suppress horizontal lighting bands on the white stand. Recorded empty-stand images that differed by 8.6–10.9 with the prior comparison differ by about 0.7 with the correction; a real card remains distinct at about 25.5. The same lighting correction is applied to framing background subtraction. The recorded local sequence correctly transitions from empty to capture, rearms on removal, and captures a second placement. Personal camera frames are not included in the repository.

## One-time Pi service update

The Pi service must advertise `directCapture: true` at `/api/health` and allow CORS requests from the exact RipnPull origins. Local preview origins on localhost are also supported. Other origins are rejected. Camera requests omit browser credentials and target only the fixed USB address `http://10.12.194.1:8000`. Chrome's local-network permission is required; the app does not expose the Pi to the public internet.

Use the prepared `usb-camera-auto-install.tar.gz` archive from the project folder. In Windows PowerShell:

```powershell
scp "C:\Users\isadi\Downloads\collecter copy\usb-camera-auto-install.tar.gz" trooper@10.12.194.1:/home/trooper/
ssh trooper@10.12.194.1
```

At the Pi prompt:

```bash
mkdir -p ~/raspberry-pi-ble-camera
tar -xzf ~/usb-camera-auto-install.tar.gz -C ~/raspberry-pi-ble-camera
sudo bash ~/raspberry-pi-ble-camera/pi/scripts/install-usb.sh
```

The installer restarts the service after updating it. Scanning thereafter needs only the live app. The Pi source is maintained in the separate `raspberry-pi-ble-camera` project.

## Verification

Tests cover insertion/motion/exposure changes, stable removal and repeated copies, direct capture and JPEG validation, cancellation during inference, automatic queueing, uncertainty review, and recovery from failed matching. The Pi service tests exercise preflight, approved and rejected origins, health capabilities and capture. Full physical testing requires installing the Pi update and using a signed-in live app session.

Similarity thresholds are conservative heuristics, not calibrated certainty. Review the queued card, language, set and finish before saving.

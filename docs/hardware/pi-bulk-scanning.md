# Pi bulk scanning

The Scan page has a signed-in **Pi bulk scan** link. This performs a full page load so Chrome preserves the connection to the separate Pi camera window. Select **Open Pi camera**, capture the front, and send the photo. Return to the app, adjust the suggested crop by clicking opposite card corners if necessary, then choose **Identify card**. Confirm a match to queue it. Repeat, select **Finish scanning**, then use the existing bulk **Add all** controls.

Messages are accepted only from the opened Pi window, configured Pi origin and current random session, with JPEG validation. New images are ignored while processing or reviewing matches. Failed identification can be retried. A successful identification clears the preview to avoid accidentally scanning the same capture twice. Two physical copies can still be captured and queued separately.

The existing Pi grading page can send photos without an update using its **Send photo to pre-grader** button. Either side label is accepted for scanning; photograph the card front. The new Pi bundle renames this button for bulk scanning and keeps the side set to front.

## Optional Pi page update

In Windows PowerShell:

```powershell
scp "C:\Users\isadi\Downloads\collecter copy\usb-camera-bulk-install.tar.gz" trooper@10.12.194.1:/home/trooper/raspberry-pi-ble-camera/
ssh trooper@10.12.194.1
```

On the Pi:

```bash
cd ~/raspberry-pi-ble-camera
tar -xzf usb-camera-bulk-install.tar.gz
sudo bash pi/scripts/install-usb.sh
```

Refresh the camera window afterward. This archive includes the rebuilt page and existing capture service files. It does not deploy the main app.

## Validation

Automated coverage exercises sender validation, photo receipt, crop preprocessing, failed-match recovery, match confirmation into the existing bulk queue, and pausing during review. Test the full physical capture-to-collection flow after deploying the main app; this requires a signed-in app session and the connected Pi. The release checkout passes full app typechecking, changed-file lint, 29 relevant tests and a production build. The build logs database connection warnings because there is no database in the local checkout.

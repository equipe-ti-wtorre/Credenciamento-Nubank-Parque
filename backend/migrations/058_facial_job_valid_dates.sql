ALTER TABLE facial_enrollment_jobs
  ADD COLUMN valid_date_start DATE NULL AFTER photo_filename,
  ADD COLUMN valid_date_end DATE NULL AFTER valid_date_start;

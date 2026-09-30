-- The checkout asks "is there already an open order for this plate and VIN?" (J8).
CREATE INDEX IF NOT EXISTS applications_by_vehicle
  ON applications (plate_prefix, plate_letters, plate_numbers, vin);

export type Track7Event = {
  date: string;
  location: string;
  status: string;
  description: string;
};

export type Track7TrackingData = {
  transaction_id: string;
  tracking_code: string;
  status: string;
  current_status: string;
  events: Track7Event[];
};

export type Track7TrackingResult =
  | { ok: true; data: Track7TrackingData }
  | { ok: false; error: string; status?: number };

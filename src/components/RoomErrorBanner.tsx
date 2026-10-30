import React from 'react';

export interface RoomErrorBannerProps {
  error: string;
  onRetry: () => void;
  bannerRef?: React.Ref<HTMLDivElement>;
}

export const RoomErrorBanner: React.FC<RoomErrorBannerProps> = ({ error, onRetry, bannerRef }) => (
  <div ref={bannerRef} role="alert" className="room-error-banner" data-role="room-error-banner">
    <span>{error}</span>
    <button type="button" onClick={onRetry}>Reconnect room</button>
  </div>
);

export default RoomErrorBanner;

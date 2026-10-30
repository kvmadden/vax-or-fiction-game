import React from 'react';
import { LookPhoneArt } from '../looks/LookPhoneArt';
import { PhoneTopicSlot } from '../looks/patterns/TopicPatternSlot';

export type PhoneScrim = 'join' | 'stage';

/** Shared show gradient; participant states retain their quieter contrast scrim. */
export const PhoneBackdrop: React.FC<{ scrim?: PhoneScrim }> = React.memo(({ scrim = 'join' }) => (
  <div className="phone-backdrop" aria-hidden="true" data-role="phone-backdrop" data-scrim={scrim}>
    {/* Show looks (VOF-93): the phone's drawn set or its picture slot. Nothing in today's look. */}
    <LookPhoneArt />
    {/* Topic patterns (VOF-94): the live question's topic, over the backdrop's scrim. Nothing between questions. */}
    <PhoneTopicSlot />
  </div>
));

PhoneBackdrop.displayName = 'PhoneBackdrop';
export default PhoneBackdrop;

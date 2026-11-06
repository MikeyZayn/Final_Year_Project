import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  ShieldCheck,
  X,
} from '../components/Icons.jsx';
import '../styles/passengerBooking.css';

/**
 * Payment gate for booking a trip.
 *
 * A booking cannot be created without choosing card or cash:
 *   - card: 16-digit number, MM/YY expiry, CVV from the back of the card.
 *           Paying returns the passenger as VERIFIED immediately.
 *   - cash: no money is taken now. The booking is PENDING until the operator
 *           verifies it at the rank, at least 30 minutes before departure.
 *
 * `onComplete(payload)` performs the real API call and must return the created
 * booking (including `passenger_display_status`).
 */
export default function PaymentModal({
  trip,
  fare,
  seats = 1,
  open = false,
  onClose,
  onViewTrips,
  onComplete,
  busy = false,
}) {
  const [step, setStep] = useState('method');
  const [method, setMethod] = useState(null);
  const [error, setError] = useState('');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvv: '' });
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const tripId = trip?.id;

  useEffect(() => {
    if (!open) return;
    setStep('method');
    setMethod(null);
    setError('');
    setCard({ name: '', number: '', expiry: '', cvv: '' });
    setCashConfirmed(false);
    setResult(null);
  }, [open, tripId]);

  const price = useMemo(() => {
    const base = fare != null ? Number(fare) : Number(trip?.route?.fare ?? 0);
    return base * Math.max(1, Number(seats) || 1);
  }, [fare, trip, seats]);

  if (!open || !trip) return null;

  const routeLabel = trip.route
    ? `${trip.route.departure?.name || 'Rank'} → ${trip.route.destination?.name || 'Destination'}`
    : trip.trip_code;

  const status =
    result?.passenger_display_status === 'verified' || result?.payment_status === 'paid'
      ? 'verified'
      : 'pending';

  function chooseMethod(next) {
    setMethod(next);
    setError('');
  }

  function continueToDetails() {
    if (!method) {
      setError(
        'Choose a payment option to continue. You cannot book without selecting card or cash.'
      );
      return;
    }
    setError('');
    setStep('details');
  }

  async function submit(payload) {
    setError('');
    setSubmitting(true);
    try {
      const booking = await onComplete(payload);
      setResult(booking || {});
      setStep('success');
    } catch (err) {
      const data = err?.response?.data;
      const message =
        (typeof data?.detail === 'string' && data.detail) ||
        data?.card_number?.[0] ||
        data?.card_expiry?.[0] ||
        data?.card_cvv?.[0] ||
        data?.card_holder_name?.[0] ||
        data?.payment_method?.[0] ||
        data?.non_field_errors?.[0] ||
        err?.message ||
        'Booking failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function submitCard(event) {
    event.preventDefault();
    const digits = card.number.replace(/\s/g, '');
    if (!card.name.trim()) {
      setError('Enter the name printed on the card.');
      return;
    }
    if (digits.length !== 16) {
      setError('Enter the 16-digit card number printed on the card.');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) {
      setError('Enter the expiry date as MM/YY.');
      return;
    }
    if (!/^\d{3,4}$/.test(card.cvv)) {
      setError('Enter the 3 or 4 digit CVV from the back of the card.');
      return;
    }
    submit({
      payment_method: 'card',
      card_holder_name: card.name.trim(),
      card_number: digits,
      card_expiry: card.expiry,
      card_cvv: card.cvv,
    });
  }

  function submitCash() {
    if (!cashConfirmed) {
      setError('Confirm that you will arrive 30 minutes early with cash.');
      return;
    }
    submit({ payment_method: 'cash' });
  }

  function updateNumber(value) {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    const grouped = digits.replace(/(.{4})/g, '$1 ').trim();
    setCard((current) => ({ ...current, number: grouped }));
  }

  function updateExpiry(value) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setCard((current) => ({ ...current, expiry: formatted }));
  }

  /* ------------------------------- success -------------------------------- */
  if (step === 'success') {
    const verified = status === 'verified';
    return (
      <div
        className="pb-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Booking confirmation"
      >
        <div className="pb-modal pb-success">
          <div className={`pb-success-icon ${verified ? '' : 'pb-pending'}`}>
            <Check size={30} />
          </div>
          <span className="pb-eyebrow pb-plain">
            {verified ? 'PAYMENT SUCCESSFUL' : 'BOOKING RECEIVED'}
          </span>
          <h2>{verified ? 'You’re ready to travel' : 'Cash booking pending'}</h2>
          <p className="pb-modal-intro">
            {verified
              ? 'You are a verified passenger on this trip. This notification is your proof of travel — show it when you board. Arrive on time; late arrivals are not refunded.'
              : 'You are a pending passenger. Arrive at least 30 minutes early with cash. The operator must verify you before departure, otherwise your seat may be released.'}
          </p>

          <div className="pb-ticket">
            <div>
              <small>TRIP ID</small>
              <strong>{result?.trip_code || trip.trip_code}</strong>
            </div>
            <span className={verified ? 'pb-verified' : 'pb-pending'}>
              {verified ? 'verified' : 'pending'}
            </span>
          </div>

          <div className="pb-summary-row" style={{ marginTop: 4 }}>
            <span>{routeLabel}</span>
            <strong>R{price.toFixed(2)}</strong>
          </div>

          <button
            className="pb-primary pb-wide"
            type="button"
            style={{ marginTop: 16 }}
            onClick={() => (onViewTrips ? onViewTrips() : onClose?.())}
          >
            View my trip
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------- modal --------------------------------- */
  return (
    <div className="pb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Book trip">
      <div className="pb-modal">
        <button className="pb-modal-close" type="button" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <span className="pb-eyebrow pb-plain">BOOK YOUR SEAT</span>
        <h2>
          {step === 'method'
            ? 'How would you like to pay?'
            : method === 'card'
              ? 'Enter your card details'
              : 'Confirm cash booking'}
        </h2>
        <p className="pb-modal-intro">
          {step === 'method'
            ? 'You must choose a payment option before your trip can be booked.'
            : method === 'card'
              ? `Secure demo payment of R${price.toFixed(2)}. No card details are stored.`
              : 'No payment is taken now. Pay the driver before boarding.'}
        </p>

        {step === 'method' && (
          <>
            <div className="pb-pay-options">
              <button
                className={`pb-pay-option ${method === 'card' ? 'pb-selected' : ''}`}
                type="button"
                onClick={() => chooseMethod('card')}
                aria-pressed={method === 'card'}
              >
                <span><CreditCard size={22} /></span>
                <div>
                  <strong>Pay with card</strong>
                  <small>Instant verification and proof of payment</small>
                </div>
                <i>{method === 'card' && <Check size={13} />}</i>
              </button>

              <button
                className={`pb-pay-option ${method === 'cash' ? 'pb-selected' : ''}`}
                type="button"
                onClick={() => chooseMethod('cash')}
                aria-pressed={method === 'cash'}
              >
                <span><Banknote size={22} /></span>
                <div>
                  <strong>Pay with cash</strong>
                  <small>Booking stays pending until operator verification</small>
                </div>
                <i>{method === 'cash' && <Check size={13} />}</i>
              </button>
            </div>

            {error && <p className="pb-error" role="alert">{error}</p>}

            <button
              className="pb-primary pb-wide"
              type="button"
              style={{ marginTop: 16 }}
              disabled={busy || submitting}
              onClick={continueToDetails}
            >
              Continue <ArrowRight size={16} />
            </button>

            <p className="pb-note" style={{ marginTop: 12 }}>
              <ShieldCheck size={14} /> Cancel more than 1 hour before departure for a full refund.
              Within 1 hour a 30% fee applies. Late arrival is not refunded.
            </p>
          </>
        )}

        {step === 'details' && method === 'card' && (
          <form className="pb-form" onSubmit={submitCard}>
            <label className="pb-field">
              <span>NAME ON CARD</span>
              <input
                value={card.name}
                onChange={(event) => setCard({ ...card, name: event.target.value })}
                autoComplete="cc-name"
                placeholder="As printed on the card"
              />
            </label>

            <label className="pb-field">
              <span>CARD NUMBER</span>
              <div className="pb-input-wrap">
                <CreditCard size={17} />
                <input
                  value={card.number}
                  onChange={(event) => updateNumber(event.target.value)}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  maxLength={19}
                  placeholder="0000 0000 0000 0000"
                />
              </div>
            </label>

            <div className="pb-form-row">
              <label className="pb-field">
                <span>EXPIRY DATE</span>
                <input
                  value={card.expiry}
                  onChange={(event) => updateExpiry(event.target.value)}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  maxLength={5}
                  placeholder="MM/YY"
                />
              </label>
              <label className="pb-field">
                <span>CVV — BACK OF CARD</span>
                <input
                  value={card.cvv}
                  onChange={(event) =>
                    setCard({ ...card, cvv: event.target.value.replace(/\D/g, '').slice(0, 4) })
                  }
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  maxLength={4}
                  placeholder="123"
                />
              </label>
            </div>

            {error && <p className="pb-error" role="alert">{error}</p>}

            <p className="pb-secure">
              <ShieldCheck size={15} /> Demo payment only. No card information is stored.
            </p>

            <button className="pb-primary pb-wide" type="submit" disabled={busy || submitting}>
              {submitting || busy ? 'Processing…' : `Pay R${price.toFixed(2)} securely`}
              {!submitting && !busy && <ArrowRight size={16} />}
            </button>

            <button className="pb-text-button" type="button" onClick={() => setStep('method')}>
              <ArrowLeft size={14} /> Change payment method
            </button>
          </form>
        )}

        {step === 'details' && method === 'cash' && (
          <div className="pb-cash">
            <div className="pb-notice">
              <Clock3 size={19} />
              <p>
                <strong>Arrive 30 minutes early</strong>
                <span>
                  The operator must verify your pending booking before the trip starts, or your
                  seat may be released.
                </span>
              </p>
            </div>

            <ul>
              <li><CheckCircle2 size={16} /> A pending notification is sent immediately</li>
              <li><CheckCircle2 size={16} /> Pay R{price.toFixed(2)} at the rank before boarding</li>
              <li><CheckCircle2 size={16} /> Keep your notification as proof of booking</li>
            </ul>

            <label className="pb-check">
              <input
                type="checkbox"
                checked={cashConfirmed}
                onChange={(event) => setCashConfirmed(event.target.checked)}
              />
              I will arrive 30 minutes before departure with cash in hand.
            </label>

            {error && <p className="pb-error" role="alert">{error}</p>}

            <button
              className="pb-primary pb-wide"
              type="button"
              disabled={busy || submitting || !cashConfirmed}
              onClick={submitCash}
            >
              {submitting || busy ? 'Booking…' : 'Confirm cash booking'}
              {!submitting && !busy && <ArrowRight size={16} />}
            </button>

            <button className="pb-text-button" type="button" onClick={() => setStep('method')}>
              <ArrowLeft size={14} /> Change payment method
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

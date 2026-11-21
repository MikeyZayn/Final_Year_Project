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
  const [cardToken, setCardToken] = useState('demo_visa');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const tripId = trip?.id;

  useEffect(() => {
    if (!open) return;
    setStep('method');
    setMethod(null);
    setError('');
    setCardToken('demo_visa');
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
        'Choose a payment option to continue.'
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
        data?.card_token?.[0] ||
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
    submit({ payment_method: 'card', card_token: cardToken });
  }

  function submitCash() {
    if (!cashConfirmed) {
      setError('Confirm how you will pay at the rank.');
      return;
    }
    submit({ payment_method: method });
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
              : (method === 'pass' ? 'Present your demo commuter pass to the operator before boarding.' : 'Your booking is pending. Pay the operator at the rank before boarding.')}
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
              ? 'Choose a demo card'
              : method === 'pass' ? 'Confirm commuter pass booking' : 'Confirm cash booking'}
        </h2>
        <p className="pb-modal-intro">
          {step === 'method'
            ? 'You must choose a payment option before your trip can be booked.'
            : method === 'card'
              ? `Simulate a payment of R${price.toFixed(2)}.`
              : method === 'pass' ? 'Present a demo commuter pass to the operator before boarding.' : 'Pay the operator at the rank before boarding.'}
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
                  <small>Simulated payment confirmation</small>
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
              <button className={`pb-pay-option ${method === 'pass' ? 'pb-selected' : ''}`}
                type="button" disabled={seats > 1} onClick={() => chooseMethod('pass')} aria-pressed={method === 'pass'}>
                <span><CheckCircle2 size={22} /></span>
                <div><strong>Commuter pass</strong><small>{seats > 1 ? 'Book each pass holder individually' : 'Present your physical pass when boarding'}</small></div>
                <i>{method === 'pass' && <Check size={13} />}</i>
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
            <label className="pb-field">Demo card
              <select value={cardToken} onChange={event => setCardToken(event.target.value)}>
                <option value="demo_visa">Visa test card ending 4242 · approve</option>
                <option value="demo_mastercard">Mastercard test card ending 4444 · approve</option>
                <option value="demo_declined">Test a decline</option>
              </select>
            </label>

            {error && <p className="pb-error" role="alert">{error}</p>}

            <p className="pb-secure">
              <ShieldCheck size={15} /> Simulation only. No card details are needed and no money moves.
            </p>

            <button className="pb-primary pb-wide" type="submit" disabled={busy || submitting}>
              {submitting || busy ? 'Processing…' : `Simulate R${price.toFixed(2)} payment`}
              {!submitting && !busy && <ArrowRight size={16} />}
            </button>

            <button className="pb-text-button" type="button" onClick={() => setStep('method')}>
              <ArrowLeft size={14} /> Change payment method
            </button>
          </form>
        )}

        {step === 'details' && (method === 'cash' || method === 'pass') && (
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
              <li><CheckCircle2 size={16} /> {method === 'pass' ? 'Present your demo commuter pass' : `Pay R${price.toFixed(2)} at the rank before boarding`}</li>
              <li><CheckCircle2 size={16} /> Keep your notification as proof of booking</li>
            </ul>

            <label className="pb-check">
              <input
                type="checkbox"
                checked={cashConfirmed}
                onChange={(event) => setCashConfirmed(event.target.checked)}
              />
              {method === 'pass' ? 'I will bring a demo commuter pass to the rank.' : 'I will arrive early with cash for the fare.'}
            </label>

            {error && <p className="pb-error" role="alert">{error}</p>}

            <button
              className="pb-primary pb-wide"
              type="button"
              disabled={busy || submitting || !cashConfirmed}
              onClick={submitCash}
            >
              {submitting || busy ? 'Booking…' : method === 'pass' ? 'Confirm pass booking' : 'Confirm cash booking'}
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

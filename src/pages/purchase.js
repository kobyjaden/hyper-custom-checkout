/* eslint-disable react/prop-types,react/destructuring-assignment */
import React from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useRouter } from 'next/router';
import { Field, Form, Formik } from 'formik';
import { createCheckout, pollCheckout } from '../services/checkout.service';
import { retrieveRelease } from '../services/release.service';

export default function Purchase({ release }) {
  const stripe = useStripe();
  const router = useRouter();
  const elements = useElements();

  async function handleSubmit(values, actions) {
    const cardElement = elements.getElement('card');

    const paymentMethod = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
      billing_details: { name: values.name.trim(), email: values.email.trim() },
    }).then((result) => {
      if (result.error) {
        alert(result.error.message);
        actions.setSubmitting(false);
        return null;
      }

      return result.paymentMethod;
    });

    await createCheckout({
      release: release.id,
      billing_details: {
        name: values.name,
        email: values.email,
      },
      payment_method: paymentMethod.id,
    }).then(async ({ id }) => {
      const checkout = await pollCheckout(id);

      if (checkout.status === 'succeeded') {
        await router.push(`/success?license=${checkout.license.key}`);
      } else {
        const paymentIntent = checkout.payment_intent_client_secret && await stripe.retrievePaymentIntent(checkout.payment_intent_client_secret);

        alert(`${paymentIntent?.last_payment_error.message || 'Your card was declined.'} Please try a different card.`);
        actions.setSubmitting(false);
      }
    }).catch((error) => {
      if (error.response.status === 400) {
        alert(error.response.data);
        actions.setSubmitting(false);
      } else alert(error);
    });
  }

  return (
    <div className="min-vh-100 d-flex align-items-center p-3 bg-light">
      <div className="card rounded-lg mx-auto border" style={{ maxWidth: '28rem' }}>
        <div className="card-header bg-white py-3">
          <h4 className="mb-0">Purchase</h4>
        </div>
        <div className="card-body">

          <div>
            Checkout as fast as possible. Good luck!
          </div>
          <hr />
          <Formik
            initialValues={{
              name: '',
              email: '',
              card: '',
            }}
            onSubmit={handleSubmit}
          >
            {({ isSubmitting }) => (
              <Form>
                <div className="form-group">
                  <label htmlFor="email">Email address</label>
                  <Field className="form-control" name="email" placeholder="johndoe@gmail.com" />
                </div>
                <div className="form-group">
                  <label htmlFor="name">Full name</label>
                  <Field className="form-control" name="name" placeholder="John Doe" />
                </div>
                <div className="form-group">
                  <label htmlFor="card">Card information</label>
                  <Field className="form-control" name="card" as={CardElement} />
                </div>

               <div className="form-group">
                  <label htmlFor="question">What is 2+2?</label>
                  <Field className="form-control" name="question" placeholder="Answer the question correctly to checkout!" />
                </div>

                <button className="btn btn-primary w-100" type="submit" disabled={isSubmitting}>Purchase</button>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps({ query }) {
  const release = await retrieveRelease(query.password);

  if (!release) return {
    redirect: {
      destination: '/password',
      permanent: false,
    },
  };

  if (release.remaining_stock < 1) return {
    redirect: {
      destination: '/oos',
      permanent: false,
    },
  };

  return {
    props: {
      timestamp: Date.now(),
      release: release ? {
        trial_period_days: release.trial_period_days,
        initial_fee: release.initial_fee,
        plan: release.plan,
        id: release.id,
      } : null,
    },
  };
}

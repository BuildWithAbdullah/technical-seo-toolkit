# One measurement tag per page view

This is not search engine optimisation and it belongs here anyway, because every
SEO decision is made against numbers, and the numbers are wrong more often than
anyone checks.

## Who owns the container

The question that gets asked last. A site can have working analytics that
belongs to somebody else: a tag container created by a previous agency, still
firing on every page, editable only from an account nobody at the company can
log into.

Everything looks fine. Data flows. Nobody notices until they want to change a
tag and find they cannot, or until the account is closed and measurement stops
on a day with no deployment.

Open the container. Confirm the account is one the site owner controls. If the
answer is no, the fix is a new container under their own login and a removal of
the old one, in that order.

## Dead properties that still ship

Universal Analytics stopped processing data in July 2023. UA tracking IDs are
still on live sites in large numbers, usually in a platform settings field
rather than the theme, which is why theme audits miss them. They cost a request
per page and report into nothing.

Search the rendered page for `UA-`, and search the platform's own analytics
settings separately, because that field is not in your codebase.

## Duplicate tags inflate everything

Two GA4 properties, or one property configured twice, and every session is
counted twice. Bounce rate, session duration and conversion rate all move, and
the direction is not intuitive, so the numbers get explained rather than
questioned.

Load a page with Tag Assistant and count what fires on one view. It should be
one.

## Reconciling against Search Console

A useful cross-check that costs nothing: compare organic sessions in analytics
against impressions and clicks in Search Console over the same period. They
measure different things and will not match, but they should be the same order
of magnitude and move together.

When analytics reports tens of thousands of sessions attributed to Google and
Search Console reports a few thousand impressions in total, those sessions did
not come from Google search. That gap is one of the few reliable signals of
automated traffic available without log analysis, and it matters here because
every SEO conclusion drawn from the inflated number is wrong.

## What cannot be measured from your own site

An embedded form hosted on another company's domain cannot be read by any
analytics tool on your page. Same-origin policy, no exceptions, no vendor
workaround. The submission event does not exist as far as your site is
concerned.

The honest response is to measure the click that leads to the form and name it
for what it is: intent, not a conversion. Calling it a conversion produces a
number that is wrong in a specific direction, and someone will eventually make a
budget decision on it.

## How to test

1. Tag Assistant on a real page load; count the tags.
2. Open each container and check the account.
3. Search the rendered HTML for `UA-` and for more than one `G-` id.
4. Check the platform's own analytics field, separately from the theme.
5. Compare analytics organic sessions against Search Console clicks.

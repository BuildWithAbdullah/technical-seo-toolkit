# A migration map with no chains and no loops

Redirect maps are written once per migration and appended to forever. Every rule
in a bad map was correct on the day it was added. That is the whole problem: the
faults are emergent, so no individual review catches them.

## Chains

`/products/rye-starter-500g` points at `/shop/rye-starter`, which points at
`/baking/starters/rye-starter`. Both rules are right. Together they cost two
round trips before the user sees anything, on the slowest connections that need
it least.

The discipline is: **when a destination moves, rewrite every rule that pointed at
it.** Do not append a new rule. Appending is faster, always works, and is how
every four-hop chain was built.

## Loops

Two correct rules in opposite directions. Usually created when someone reverses a
decision and adds the reverse rule without deleting the original. The browser
gives up after a handful of hops and shows an error page, so a loop is a hard
outage for those URLs rather than a slow path.

They are easy to detect and almost never detected, because a redirect map is
read as a list rather than walked as a graph.

## 302 for a permanent move

A 302 says the move is temporary and the original URL should stay indexed.
Google is reasonably good at working out when you meant 301, but relying on that
is choosing to be interpreted rather than understood.

The version that persists is the launch-day 302 that nobody changed. If it was
temporary and the temporary period is over, it is a 301 now.

## Where the map is not the truth

The map is one of several things redirecting. The CDN has rules, the platform
adds its own for trailing slashes and case, the CMS redirects unpublished pages,
and an application-level rule may run before any of them. Two clean maps can
still produce a chain when stacked.

That is why the test is `curl` against the deployed site rather than review of
the file. The file is an intention; the response chain is the fact.

## How to test

```bash
curl -sIL -o /dev/null -w '%{num_connects} hops, final %{http_code} %{url_effective}\n' \
  https://www.example.com/products/rye-starter-500g
```

Run it over every source URL in the map after deployment. Anything that is not
one hop to a 200 is a rule to rewrite.

## Related

- [`../canonical-tags/`](../canonical-tags/) - a canonical pointing at a
  redirecting URL is the same fault expressed in a different tag

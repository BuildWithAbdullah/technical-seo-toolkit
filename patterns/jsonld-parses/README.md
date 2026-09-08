# Structured data that survives the parser

Structured data fails silently. A block that does not parse produces no error,
no warning and no row in any report. It is simply absent, and absence looks
exactly like never having added it.

## The four ways a valid block arrives broken

**Truncated.** A CMS field with a length limit cuts the JSON partway through.
The block is invalid, so all of it is discarded, including the parts before the
cut. This is the one that survives longest, because the source looks right in the
editor and the damage happens on save.

**Escaped.** Pasted into a rich text field rather than a code block, so the
quotes arrive as `&quot;`. It renders as text and parses as nothing.

**Duplicated.** Someone notices the first block is broken and adds a second
rather than fixing the first. Now there are two claims about the same entity.

**Empty.** A plugin emits the script tag whether or not it has anything to put
in it.

Three of those four are introduced between the editor and the page. That is why
testing the markup you pasted proves nothing.

## Build it, do not template it

Serialise from real data at render time:

```js
const schema = { '@context': 'https://schema.org', '@graph': nodes };
const json = JSON.stringify(schema);
```

A structure that is built and stringified cannot be truncated by a field limit
or escaped by an editor, because it never passes through either. Keeping JSON-LD
as a string in a CMS field invites both.

## Do not put comments in it

A `_comment` key inside a graph is shipped to search engines. Schema.org ignores
unknown properties so it is harmless to them, but it is not harmless to your
tooling: while writing this repository, exactly such a key silently disabled the
dangling-reference check in the verifier, because a reference node is recognised
by having only an `@id` and the annotation gave it two keys. Annotations go in
HTML comments outside the block.

## How to test

Both validators, on the live URL:

- **Rich Results Test** tells you what Google can use for a rich result.
- **Schema Markup Validator** tells you whether the markup is well formed at
  all, including types Google has no feature for.

They answer different questions and a page can pass one and fail the other. Test
the URL, never the snippet, because the snippet is not what shipped.

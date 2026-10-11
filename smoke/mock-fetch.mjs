globalThis.fetch = async (input) => {
  const url = String(input);
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  if (url.includes("/repos/foo/bar/issues/1")) {
    return json({
      node_id: "ISSUE_NODE",
      number: 1,
      title: "Empty taxonomy",
      body: null,
      state: "open",
      labels: [],
    });
  }
  if (url.includes("/repos/foo/bar/labels")) return json([]);
  if (url.endsWith("/graphql")) {
    return json({
      data: {
        node: {
          timelineItems: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });
  }
  return json({ message: "unexpected mocked endpoint" }, 404);
};

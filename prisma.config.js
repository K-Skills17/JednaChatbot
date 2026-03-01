// JS config for production — used by prisma db push at deploy time.
// Uses dynamic import since prisma/config is ESM.
module.exports = import("prisma/config").then(({ defineConfig }) =>
  defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
      url: process.env["DATABASE_URL"],
    },
  })
);

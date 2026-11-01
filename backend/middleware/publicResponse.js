const { serializePublic } = require("../utils/publicSerializer");

function publicResponseMiddleware(req, res, next) {
  const orig = res.json.bind(res);
  let sent = false;
  res.json = function publicJson(body) {
    if (sent) return orig(body);
    sent = true;
    serializePublic(body)
      .then((clean) => orig(clean))
      .catch((err) => {
        sent = false;
        next(err);
      });
    return res;
  };
  next();
}

module.exports = publicResponseMiddleware;

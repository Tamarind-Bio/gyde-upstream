import { HttpError } from "./errors.js";

// Reject overload before reading/decompressing upload bodies. A bounded database
// pool alone would still allow unlimited parsed 50 MiB bodies to wait in memory.
export function admission(limit) {
  let active = 0;
  return (_req, res, next) => {
    if (active >= limit) {
      res.set("Retry-After", "5");
      return next(
        new HttpError(
          429,
          "The compute adapter is busy. Please retry in a few seconds.",
        ),
      );
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}

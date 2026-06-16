export class LatestRequestGuard {
  private token = 0

  next() {
    this.token += 1
    return this.token
  }

  isCurrent(token: number) {
    return this.token === token
  }

  invalidate() {
    this.token += 1
  }
}

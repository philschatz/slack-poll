/* eslint-env jest */
describe('example test suite', () => {
  // Read more about fake timers
  // http://facebook.github.io/jest/docs/en/timer-mocks.html#content
  jest.useFakeTimers()

  it('passes a trivial test', () => {
    expect(true).toBe(true)
  })
})

const Token = artifacts.require("Token");
const DutchMarket = artifacts.require("DutchMarket");
const { toWei } = web3.utils;

contract('DutchMarket', (accounts) => {
    it('deposit 1000 Token in the contract escrow account', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Deposit 1000 tokens.
        const amount = toWei("1000", "ether");
        await dutchMarketInstance.depositToken(tokenInstance.address, amount, { from: accounts[0] });
        // Check the current balance of tokens held in the contract's account
        const balance = await dutchMarketInstance.getAccountTokenBalance(tokenInstance.address, {
            from: accounts[0]
        });
        // Check if it is equal to 1000
        assert.equal(balance, amount, "successful deposit 1000 Token");
    });
    it('Withdraw 1000 Token in the first account', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Withdraw 1000 tokens
        const amount = toWei("1000", "ether");
        await dutchMarketInstance.withdrawToken(tokenInstance.address, amount, { from: accounts[0] });
        // Check the current balance of tokens held in the contract's account
        const balance = await dutchMarketInstance.getAccountTokenBalance(tokenInstance.address, {
            from: accounts[0]
        });
        // Check if it is equal to 0
        assert.equal(balance, 0, "successful withdraw 1000 Token");
    });
});

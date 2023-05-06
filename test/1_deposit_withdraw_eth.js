const DutchMarket = artifacts.require("DutchMarket");
const { toWei, fromWei } = web3.utils;

contract('DutchMarket', (accounts) => {
    it('deposit 1 ETH in the contract escrow account', async () => {
        const dutchMarketInstance = await DutchMarket.deployed();
        // Deposit 1 ETH.
        const amount = toWei("1", "ether");
        await dutchMarketInstance.depositETH({ from: accounts[0], value: amount });
        // Check the current balance of ETH held in the contract's account
        const balance = await dutchMarketInstance.getAccountBalance({
            from: accounts[0]
        });
        // Check if it is equal to 1.
        assert.equal(fromWei(balance, "ether"), 1, "successful deposit 1 ETH");
    });
    it('withdraw 1 ETH in the first account', async () => {
        const dutchMarketInstance = await DutchMarket.deployed();
        // Withdraw 1 ETH.
        const amount = toWei("1", "ether");
        await dutchMarketInstance.withdrawETH(amount, { from: accounts[0] });
        // Check the current balance of ETH held in the contract's account
        const balance = await dutchMarketInstance.getAccountBalance({ from: accounts[0] });
        // Check if it is equal to 0
        assert.equal(fromWei(balance, "ether"), 0, "successful withdraw 1 ETH");
    });
});

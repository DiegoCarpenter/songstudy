// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SongStudyMarket} from "../src/SongStudyMarket.sol";

contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract SongStudyMarketTest is Test {
    SongStudyMarket market;
    MockUSDC usdc;

    address creator = makeAddr("creator");
    address listener = makeAddr("listener");
    address other = makeAddr("other");

    uint96 constant PRICE = 50_000; // $0.05
    bytes32 constant HASH = keccak256("audio||lyrics");
    string constant URI = "https://blob.example/meta.json";

    event Published(
        uint256 indexed id, address indexed creator, bytes32 indexed contentHash, uint96 price, string metadataURI
    );
    event Unlocked(uint256 indexed id, address indexed listener, uint96 price);
    event Tipped(uint256 indexed id, address indexed from, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        market = new SongStudyMarket(address(usdc));
        usdc.mint(listener, 10e6);
        usdc.mint(other, 10e6);
        vm.prank(listener);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(other);
        usdc.approve(address(market), type(uint256).max);
    }

    function _publish(uint96 price) internal returns (uint256) {
        vm.prank(creator);
        return market.publish(HASH, price, URI);
    }

    // ---- publish ----

    function test_Publish_StoresTrackAndEmits() public {
        vm.warp(1_700_000_000);
        vm.expectEmit(address(market));
        emit Published(0, creator, HASH, PRICE, URI);
        uint256 id = _publish(PRICE);

        assertEq(id, 0);
        assertEq(market.trackCount(), 1);
        SongStudyMarket.Track memory t = market.getTrack(id);
        assertEq(t.creator, creator);
        assertEq(t.price, PRICE);
        assertEq(t.contentHash, HASH);
        assertEq(t.metadataURI, URI);
        assertEq(t.createdAt, 1_700_000_000);
        assertTrue(market.isPublished(HASH));
    }

    function test_Publish_SequentialIds() public {
        vm.startPrank(creator);
        assertEq(market.publish(keccak256("a"), 0, URI), 0);
        assertEq(market.publish(keccak256("b"), 0, URI), 1);
        vm.stopPrank();
    }

    function test_Publish_RevertsOnDuplicateHash() public {
        _publish(PRICE);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.AlreadyPublished.selector, HASH));
        market.publish(HASH, PRICE, URI);
    }

    function test_Publish_RevertsOnEmptyHash() public {
        vm.expectRevert(SongStudyMarket.EmptyContentHash.selector);
        market.publish(bytes32(0), PRICE, URI);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(SongStudyMarket.ZeroAddress.selector);
        new SongStudyMarket(address(0));
    }

    // ---- unlock ----

    function test_Unlock_PaysCreatorExactly() public {
        uint256 id = _publish(PRICE);
        uint256 listenerBefore = usdc.balanceOf(listener);

        vm.expectEmit(address(market));
        emit Unlocked(id, listener, PRICE);
        vm.prank(listener);
        market.unlock(id);

        assertEq(usdc.balanceOf(creator), PRICE);
        assertEq(usdc.balanceOf(listener), listenerBefore - PRICE);
        assertEq(usdc.balanceOf(address(market)), 0);
        assertTrue(market.hasAccess(id, listener));
    }

    function test_Unlock_DoubleUnlockReverts() public {
        uint256 id = _publish(PRICE);
        vm.startPrank(listener);
        market.unlock(id);
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.AlreadyHasAccess.selector, id, listener));
        market.unlock(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(creator), PRICE);
    }

    function test_Unlock_CreatorCannotUnlockOwn() public {
        uint256 id = _publish(PRICE);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.AlreadyHasAccess.selector, id, creator));
        market.unlock(id);
    }

    function test_Unlock_FreeTrack() public {
        uint256 id = _publish(0);
        address broke = makeAddr("broke"); // no balance, no approval

        vm.expectEmit(address(market));
        emit Unlocked(id, broke, 0);
        vm.prank(broke);
        market.unlock(id);

        assertTrue(market.hasAccess(id, broke));
        assertEq(usdc.balanceOf(creator), 0);
    }

    function test_Unlock_RevertsWithoutAllowance() public {
        uint256 id = _publish(PRICE);
        address noApproval = makeAddr("noApproval");
        usdc.mint(noApproval, 1e6);
        vm.prank(noApproval);
        vm.expectRevert(SongStudyMarket.TransferFailed.selector);
        market.unlock(id);
        assertFalse(market.hasAccess(id, noApproval));
    }

    function test_Unlock_RevertsOnUnknownTrack() public {
        vm.prank(listener);
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.TrackNotFound.selector, 7));
        market.unlock(7);
    }

    // ---- tip ----

    function test_Tip_PaysCreator() public {
        uint256 id = _publish(PRICE);
        vm.expectEmit(address(market));
        emit Tipped(id, other, 250_000);
        vm.prank(other);
        market.tip(id, 250_000);
        assertEq(usdc.balanceOf(creator), 250_000);
        assertFalse(market.hasAccess(id, other)); // tipping is not unlocking
    }

    function test_Tip_RevertsOnZero() public {
        uint256 id = _publish(PRICE);
        vm.prank(other);
        vm.expectRevert(SongStudyMarket.ZeroAmount.selector);
        market.tip(id, 0);
    }

    function test_Tip_RevertsOnUnknownTrack() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.TrackNotFound.selector, 0));
        market.tip(0, 1);
    }

    // ---- hasAccess ----

    function test_HasAccess() public {
        uint256 id = _publish(PRICE);
        assertTrue(market.hasAccess(id, creator));
        assertFalse(market.hasAccess(id, listener));
        vm.prank(listener);
        market.unlock(id);
        assertTrue(market.hasAccess(id, listener));
        assertFalse(market.hasAccess(id, other));
    }

    function test_HasAccess_RevertsOnUnknownTrack() public {
        vm.expectRevert(abi.encodeWithSelector(SongStudyMarket.TrackNotFound.selector, 0));
        market.hasAccess(0, creator);
    }

    function testFuzz_Unlock_PaysExactPrice(uint96 price) public {
        price = uint96(bound(price, 1, 10e6));
        uint256 id = _publish(price);
        vm.prank(listener);
        market.unlock(id);
        assertEq(usdc.balanceOf(creator), price);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title SongStudyMarket
/// @notice Students publish study songs (content hash + price) and classmates unlock them with USDC.
///         Payments go straight from listener to creator. No admin, no fees, no custody.
contract SongStudyMarket {
    struct Track {
        address creator;
        uint96 price; // USDC base units (6 decimals): 50_000 = $0.05
        bytes32 contentHash; // keccak256(audio bytes || lyrics JSON)
        string metadataURI;
        uint64 createdAt;
    }

    IERC20 public immutable usdc;

    Track[] private _tracks;
    mapping(uint256 id => mapping(address listener => bool)) private _unlocked;
    mapping(bytes32 contentHash => bool) public isPublished;

    event Published(
        uint256 indexed id, address indexed creator, bytes32 indexed contentHash, uint96 price, string metadataURI
    );
    event Unlocked(uint256 indexed id, address indexed listener, uint96 price);
    event Tipped(uint256 indexed id, address indexed from, uint256 amount);

    error ZeroAddress();
    error EmptyContentHash();
    error AlreadyPublished(bytes32 contentHash);
    error TrackNotFound(uint256 id);
    error AlreadyHasAccess(uint256 id, address who);
    error ZeroAmount();
    error TransferFailed();

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Publish a song. The content hash can only be published once (first publisher = author).
    function publish(bytes32 contentHash, uint96 price, string calldata metadataURI) external returns (uint256 id) {
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (isPublished[contentHash]) revert AlreadyPublished(contentHash);

        isPublished[contentHash] = true;
        id = _tracks.length;
        _tracks.push(
            Track({
                creator: msg.sender,
                price: price,
                contentHash: contentHash,
                metadataURI: metadataURI,
                createdAt: uint64(block.timestamp)
            })
        );
        emit Published(id, msg.sender, contentHash, price, metadataURI);
    }

    /// @notice Unlock a track. Pays `price` USDC from caller to creator (requires prior approve). Free if price == 0.
    function unlock(uint256 id) external {
        Track storage t = _track(id);
        if (msg.sender == t.creator || _unlocked[id][msg.sender]) revert AlreadyHasAccess(id, msg.sender);

        _unlocked[id][msg.sender] = true;
        uint96 price = t.price;
        if (price > 0) _pay(msg.sender, t.creator, price);
        emit Unlocked(id, msg.sender, price);
    }

    /// @notice Tip a track's creator any USDC amount (requires prior approve).
    function tip(uint256 id, uint256 amount) external {
        Track storage t = _track(id);
        if (amount == 0) revert ZeroAmount();
        _pay(msg.sender, t.creator, amount);
        emit Tipped(id, msg.sender, amount);
    }

    function hasAccess(uint256 id, address who) external view returns (bool) {
        Track storage t = _track(id);
        return who == t.creator || _unlocked[id][who];
    }

    function getTrack(uint256 id) external view returns (Track memory) {
        return _track(id);
    }

    function trackCount() external view returns (uint256) {
        return _tracks.length;
    }

    function _track(uint256 id) private view returns (Track storage) {
        if (id >= _tracks.length) revert TrackNotFound(id);
        return _tracks[id];
    }

    /// @dev Tolerates tokens that return nothing as well as ones that return bool.
    function _pay(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
